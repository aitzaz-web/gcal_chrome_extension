const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID || 'gpal-2d486',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

// Helper function to find user by Stripe customer ID
async function findUserByStripeCustomerId(customerId) {
  const usersRef = db.collection('users');
  const snapshot = await usersRef.where('stripeCustomerId', '==', customerId).limit(1).get();
  return snapshot.empty ? null : { doc: snapshot.docs[0], id: snapshot.docs[0].id };
}

// Helper function to find user by email
async function findUserByEmail(email) {
  const usersRef = db.collection('users');
  const snapshot = await usersRef.where('email', '==', email).limit(1).get();
  return snapshot.empty ? null : { doc: snapshot.docs[0], id: snapshot.docs[0].id };
}

export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;
    console.log(`Received webhook event: ${event.type}`);

    // Handle successful payment completion (initial signup)
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      
      // Email can be in customer_email OR customer_details.email
      const customerEmail = session.customer_email || session.customer_details?.email;

      console.log(`Payment completed for email: ${customerEmail}`);

      if (customerEmail) {
        try {
          const userResult = await findUserByEmail(customerEmail);

          if (userResult) {
            const userId = userResult.id;
            
            console.log(`Found user: ${userId}`);

            // Update user subscription
            await db.collection('users').doc(userId).update({
              subscribed: true,
              subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
              stripeCustomerId: session.customer,
              stripeSubscriptionId: session.subscription
            });

            console.log(`✅ Successfully upgraded user ${customerEmail} to Pro!`);
            
            return res.status(200).json({ 
              received: true,
              email: customerEmail,
              upgraded: true,
              userId: userId,
              message: `User ${customerEmail} upgraded to Pro successfully!`
            });
          } else {
            console.log(`❌ User not found with email: ${customerEmail}`);
            return res.status(200).json({ 
              received: true,
              email: customerEmail,
              upgraded: false,
              message: `User with email ${customerEmail} not found in database`
            });
          }
        } catch (firestoreError) {
          console.error('Firestore error:', firestoreError);
          return res.status(200).json({ 
            received: true,
            email: customerEmail,
            upgraded: false,
            error: 'Failed to update database',
            details: firestoreError.message
          });
        }
      }
    }

    // Handle subscription cancellation
    else if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      console.log(`Subscription cancelled for customer: ${customerId}`);

      try {
        const userResult = await findUserByStripeCustomerId(customerId);

        if (userResult) {
          const userId = userResult.id;
          
          console.log(`Found user to downgrade: ${userId}`);

          // Downgrade user subscription
          await db.collection('users').doc(userId).update({
            subscribed: false,
            subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            subscriptionEndReason: 'cancelled'
          });

          console.log(`✅ Successfully downgraded user ${userId} - subscription cancelled`);
          
          return res.status(200).json({ 
            received: true,
            customerId: customerId,
            downgraded: true,
            userId: userId,
            message: `User downgraded - subscription cancelled`
          });
        } else {
          console.log(`❌ User not found with customer ID: ${customerId}`);
          return res.status(200).json({ 
            received: true,
            customerId: customerId,
            downgraded: false,
            message: `User with customer ID ${customerId} not found in database`
          });
        }
      } catch (firestoreError) {
        console.error('Firestore error:', firestoreError);
        return res.status(200).json({ 
          received: true,
          customerId: customerId,
          downgraded: false,
          error: 'Failed to update database',
          details: firestoreError.message
        });
      }
    }

    // Handle failed payment (after retry attempts)
    else if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      const customerId = invoice.customer;
      const subscriptionId = invoice.subscription;

      console.log(`Payment failed for customer: ${customerId}, subscription: ${subscriptionId}`);

      try {
        const userResult = await findUserByStripeCustomerId(customerId);

        if (userResult) {
          const userId = userResult.id;
          
          console.log(`Found user to downgrade: ${userId}`);

          // Downgrade user subscription
          await db.collection('users').doc(userId).update({
            subscribed: false,
            subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            subscriptionEndReason: 'payment_failed'
          });

          console.log(`✅ Successfully downgraded user ${userId} - payment failed`);
          
          return res.status(200).json({ 
            received: true,
            customerId: customerId,
            downgraded: true,
            userId: userId,
            message: `User downgraded - payment failed`
          });
        } else {
          console.log(`❌ User not found with customer ID: ${customerId}`);
          return res.status(200).json({ 
            received: true,
            customerId: customerId,
            downgraded: false,
            message: `User with customer ID ${customerId} not found in database`
          });
        }
      } catch (firestoreError) {
        console.error('Firestore error:', firestoreError);
        return res.status(200).json({ 
          received: true,
          customerId: customerId,
          downgraded: false,
          error: 'Failed to update database',
          details: firestoreError.message
        });
      }
    }

    // Handle subscription status changes
    else if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      const status = subscription.status;

      console.log(`Subscription updated for customer: ${customerId}, status: ${status}`);

      try {
        const userResult = await findUserByStripeCustomerId(customerId);

        if (userResult) {
          const userId = userResult.id;
          
          // Check if subscription is now inactive
          if (['canceled', 'unpaid', 'past_due'].includes(status)) {
            console.log(`Found user to downgrade: ${userId} - status: ${status}`);

            // Downgrade user subscription
            await db.collection('users').doc(userId).update({
              subscribed: false,
              subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
              subscriptionEndReason: `status_${status}`,
              stripeSubscriptionStatus: status
            });

            console.log(`✅ Successfully downgraded user ${userId} - status: ${status}`);
            
            return res.status(200).json({ 
              received: true,
              customerId: customerId,
              downgraded: true,
              userId: userId,
              status: status,
              message: `User downgraded - subscription status: ${status}`
            });
          } 
          // Check if subscription is now active (reactivated)
          else if (status === 'active') {
            console.log(`Found user to upgrade: ${userId} - status: ${status}`);

            // Upgrade user subscription
            await db.collection('users').doc(userId).update({
              subscribed: true,
              subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
              stripeSubscriptionStatus: status
            });

            console.log(`✅ Successfully upgraded user ${userId} - status: ${status}`);
            
            return res.status(200).json({ 
              received: true,
              customerId: customerId,
              upgraded: true,
              userId: userId,
              status: status,
              message: `User upgraded - subscription status: ${status}`
            });
          }
          // Just log status for other cases
          else {
            await db.collection('users').doc(userId).update({
              stripeSubscriptionStatus: status,
              subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return res.status(200).json({ 
              received: true,
              customerId: customerId,
              userId: userId,
              status: status,
              message: `Subscription status updated: ${status}`
            });
          }
        } else {
          console.log(`❌ User not found with customer ID: ${customerId}`);
          return res.status(200).json({ 
            received: true,
            customerId: customerId,
            message: `User with customer ID ${customerId} not found in database`
          });
        }
      } catch (firestoreError) {
        console.error('Firestore error:', firestoreError);
        return res.status(200).json({ 
          received: true,
          customerId: customerId,
          error: 'Failed to update database',
          details: firestoreError.message
        });
      }
    }

    // Handle successful monthly payments (keeps user subscribed)
    else if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object;
      const customerId = invoice.customer;
      const subscriptionId = invoice.subscription;

      console.log(`Payment succeeded for customer: ${customerId}, subscription: ${subscriptionId}`);

      try {
        const userResult = await findUserByStripeCustomerId(customerId);

        if (userResult) {
          const userId = userResult.id;
          
          console.log(`Found user to confirm subscription: ${userId}`);

          // Ensure user subscription is active
          await db.collection('users').doc(userId).update({
            subscribed: true,
            subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastPaymentDate: admin.firestore.FieldValue.serverTimestamp(),
            stripeSubscriptionStatus: 'active'
          });

          console.log(`✅ Confirmed subscription for user ${userId} - payment succeeded`);
          
          return res.status(200).json({ 
            received: true,
            customerId: customerId,
            confirmed: true,
            userId: userId,
            message: `User subscription confirmed - payment succeeded`
          });
        } else {
          console.log(`❌ User not found with customer ID: ${customerId}`);
          return res.status(200).json({ 
            received: true,
            customerId: customerId,
            message: `User with customer ID ${customerId} not found in database`
          });
        }
      } catch (firestoreError) {
        console.error('Firestore error:', firestoreError);
        return res.status(200).json({ 
          received: true,
          customerId: customerId,
          error: 'Failed to update database',
          details: firestoreError.message
        });
      }
    }

    // Always respond with success to acknowledge receipt
    res.status(200).json({ 
      received: true,
      eventType: event.type,
      message: `Processed ${event.type} event`
    });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

// Important: Disable body parsing for Stripe webhooks
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
} 
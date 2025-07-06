const express = require('express');
const cors = require('cors');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'gpal-2d486'
});

// Create a Stripe checkout session
app.post('/create-checkout-session', async (req, res) => {
  const { userId, userEmail } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: userEmail,
      line_items: [
        {
          price: 'price_test_28EbJ1ejTaPleU4diG7Re00', // Stripe price ID from the URL
          quantity: 1,
        },
      ],
      success_url: 'chrome-extension://cebimckdealkidgemadnbniaoafajbgk/popup.html?success=true',
      cancel_url: 'chrome-extension://cebimckdealkidgemadnbniaoafajbgk/popup.html?canceled=true',
      metadata: {
        userId: userId
      }
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook to handle successful subscriptions
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, 'YOUR_STRIPE_WEBHOOK_SECRET');
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata.userId;

    // Update user's subscription status in Firestore
    await admin.firestore().collection('users').doc(userId).set({
      subscribed: true,
      subscriptionId: session.subscription,
      customerId: session.customer
    }, { merge: true });
  }

  res.json({ received: true });
});

// Check subscription status
app.get('/check-subscription/:userId', async (req, res) => {
  try {
    const doc = await admin.firestore().collection('users').doc(req.params.userId).get();
    res.json({ subscribed: doc.exists ? doc.data().subscribed : false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 
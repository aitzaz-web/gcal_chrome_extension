// --- OAuth-enhanced popup.js with calendar selection ---

import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment, serverTimestamp, collection } from "firebase/firestore";
import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Usage tracking functions
async function getUserUsage(userId) {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      const data = userDoc.data();
      return {
        requestsUsed: data.requestsUsed || 0,
        subscribed: data.subscribed || false
      };
    }
    return { requestsUsed: 0, subscribed: false };
  } catch (error) {
    console.error('Error getting user usage:', error);
    return { requestsUsed: 0, subscribed: false };
  }
}

// Create or update user document in Firestore
async function ensureUserDocument(user) {
  try {
    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) {
      // Create new user document with default values
      await setDoc(userRef, {
        email: user.email,
        requestsUsed: 0,
        subscribed: false,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp()
      });
      console.log('Created new user document for:', user.email);
    } else {
      // Update last login time and ensure email is set
      await updateDoc(userRef, {
        email: user.email,
        lastLoginAt: serverTimestamp()
      });
      console.log('Updated user document for:', user.email);
    }
  } catch (error) {
    console.error('Error ensuring user document:', error);
  }
}

async function updateUserUsage(userId) {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      requestsUsed: increment(1),
      lastRequestAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating user usage:', error);
  }
}

function updateUsageDisplay(requestsUsed, subscribed) {
  const usageCount = document.getElementById('usageCount');
  const usageLimit = document.getElementById('usageLimit');
  const usageProgress = document.getElementById('usageProgress');
  const subscribeBtn = document.getElementById('subscribeBtn');
  const usageCard = document.getElementById('usageCounter');
  const usageLabel = usageCard?.querySelector('.usage-label');
  
  if (subscribed) {
    usageCount.textContent = '∞';
    usageLimit.textContent = '∞';
    usageProgress.style.width = '100%';
    usageProgress.className = 'usage-progress unlimited';
    if (usageLabel) {
      usageLabel.textContent = 'Pro subscription - unlimited requests';
    }
    if (subscribeBtn) {
      subscribeBtn.innerHTML = '<span class="material-symbols-outlined btn-icon">settings</span>Manage Subscription';
      subscribeBtn.className = 'btn btn-success btn-full';
    }
  } else {
    const limit = 5;
    // Cap the displayed usage at the free limit to avoid showing 8/5 etc.
    const displayedUsage = Math.min(requestsUsed, limit);
    
    usageCount.textContent = displayedUsage;
    usageLimit.textContent = limit;
    
    const percentage = (displayedUsage / limit) * 100;
    usageProgress.style.width = percentage + '%';
    
    // Update progress bar color based on usage
    usageProgress.className = 'usage-progress';
    if (percentage >= 80) {
      usageProgress.classList.add('danger');
    } else if (percentage >= 60) {
      usageProgress.classList.add('warning');
    }
    
    if (usageLabel) {
      usageLabel.textContent = 'Free tier includes 5 requests only';
    }
    
    // Update subscription button text
    if (subscribeBtn) {
      if (requestsUsed >= limit) {
        subscribeBtn.innerHTML = '<span class="material-symbols-outlined btn-icon">star</span>Upgrade Required - $0.99/month';
        subscribeBtn.className = 'btn btn-warning btn-full';
      } else {
        subscribeBtn.innerHTML = '<span class="material-symbols-outlined btn-icon">star</span>Upgrade to Pro - $0.99/month';
        subscribeBtn.className = 'btn btn-warning btn-full';
      }
    }
  }
}

// Auth state observer
onAuthStateChanged(auth, async user => {
  const whenSignedIn = document.getElementById('whenSignedIn');
  const whenSignedOut = document.getElementById('whenSignedOut');
  const userEmail = document.getElementById('userEmail');
  const usageSection = document.getElementById('usageSection');
  
  // Header elements
  const headerSignedIn = document.getElementById('headerSignedIn');
  const headerSignedOut = document.getElementById('headerSignedOut');
  const headerUserEmail = document.getElementById('headerUserEmail');

  if (user) {
    // Check if email is verified
    if (!user.emailVerified) {
      // User exists but email not verified
      alert('Please verify your email address before continuing. Check your inbox for verification email.');
      signOut(auth);
      return;
    }
    
    // Ensure user document exists with email field
    await ensureUserDocument(user);
    
    // Signed in and verified
    whenSignedIn.classList.remove('hidden');
    whenSignedOut.classList.add('hidden');
    if (userEmail) userEmail.textContent = user.email;
    if (usageSection) usageSection.classList.remove('hidden');
    
    // Update header
    headerSignedIn.classList.remove('hidden');
    headerSignedOut.classList.add('hidden');
    headerUserEmail.textContent = user.email;
    
    // Load and display usage data
    const usage = await getUserUsage(user.uid);
    updateUsageDisplay(usage.requestsUsed, usage.subscribed);
    
  } else {
    // Not signed in
    whenSignedIn.classList.add('hidden');
    whenSignedOut.classList.remove('hidden');
    if (usageSection) usageSection.classList.add('hidden');
    
    // Update header
    headerSignedIn.classList.add('hidden');
    headerSignedOut.classList.remove('hidden');
  }
});

// Modal management functions
function showAuthModal(isSignUp = false) {
  const modal = document.getElementById('authModal');
  const modalTitle = document.getElementById('modalTitle');
  const submitBtn = document.getElementById('submitAuth');
  const emailInput = document.getElementById('modalEmail');
  const passwordInput = document.getElementById('modalPassword');
  const forgotPasswordLink = document.getElementById('forgotPasswordLink');
  
  // Reset form
  emailInput.value = '';
  passwordInput.value = '';
  
  // Set modal content based on sign-in or sign-up
  if (isSignUp) {
    modalTitle.textContent = 'Sign Up';
    submitBtn.textContent = 'Sign Up';
    submitBtn.innerHTML = '<span class="material-symbols-outlined btn-icon">person_add</span>Sign Up';
    passwordInput.placeholder = 'Enter your password (minimum 6 characters)';
    // Hide forgot password link for sign up
    forgotPasswordLink.style.display = 'none';
  } else {
    modalTitle.textContent = 'Sign In';
    submitBtn.textContent = 'Sign In';
    submitBtn.innerHTML = '<span class="material-symbols-outlined btn-icon">login</span>Sign In';
    passwordInput.placeholder = 'Enter your password';
    // Show forgot password link for sign in
    forgotPasswordLink.style.display = 'block';
  }
  
  // Store the mode for form submission
  modal.dataset.mode = isSignUp ? 'signup' : 'signin';
  
  // Show modal
  modal.classList.remove('hidden');
  emailInput.focus();
}

function hideAuthModal() {
  const modal = document.getElementById('authModal');
  modal.classList.add('hidden');
}

// Email/Password Sign In with modal
document.getElementById('signInBtn').addEventListener('click', () => {
  showAuthModal(false);
});

// Email/Password Sign Up with modal
document.getElementById('signUpBtn').addEventListener('click', () => {
  showAuthModal(true);
});

// Header auth buttons (same functionality)
document.getElementById('headerSignInBtn').addEventListener('click', () => {
  showAuthModal(false);
});

document.getElementById('headerSignUpBtn').addEventListener('click', () => {
  showAuthModal(true);
});

// Modal event handlers
document.getElementById('closeModal').addEventListener('click', hideAuthModal);
document.getElementById('cancelAuth').addEventListener('click', hideAuthModal);

// Click outside modal to close
document.getElementById('authModal').addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    hideAuthModal();
  }
});

// Keyboard support for modal
document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('authModal');
  if (!modal.classList.contains('hidden')) {
    if (e.key === 'Escape') {
      hideAuthModal();
    }
  }
});

// Handle form submission
document.getElementById('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const modal = document.getElementById('authModal');
  const isSignUp = modal.dataset.mode === 'signup';
  const email = document.getElementById('modalEmail').value;
  const password = document.getElementById('modalPassword').value;
  
  if (!email || !password) {
    alert('Please enter both email and password');
    return;
  }
  
  if (isSignUp && password.length < 6) {
    alert('Password must be at least 6 characters long');
    return;
  }
  
  try {
    if (isSignUp) {
      // Create user account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Send email verification
      await sendEmailVerification(user);
      
      // Sign out the user until they verify
      signOut(auth);
      
      hideAuthModal();
      alert('Account created successfully! Please check your email and click the verification link before signing in.');
      
    } else {
      // Sign in
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Check email verification
      if (!user.emailVerified) {
        alert('Please verify your email address first. Check your inbox for verification email.');
        signOut(auth);
        hideAuthModal();
        return;
      }
      
      hideAuthModal();
      console.log('Successfully signed in:', user.email);
    }
  } catch (error) {
    console.error('Error with authentication:', error);
    
    // Better error messages
    let errorMessage = (isSignUp ? 'Sign-up' : 'Sign-in') + ' failed: ';
    switch (error.code) {
      case 'auth/user-not-found':
        errorMessage += 'No account found with this email.';
        break;
      case 'auth/wrong-password':
        errorMessage += 'Incorrect password.';
        break;
      case 'auth/invalid-email':
        errorMessage += 'Invalid email address.';
        break;
      case 'auth/user-disabled':
        errorMessage += 'This account has been disabled.';
        break;
      case 'auth/email-already-in-use':
        errorMessage += 'An account with this email already exists.';
        break;
      case 'auth/weak-password':
        errorMessage += 'Password is too weak.';
        break;
      default:
        errorMessage += error.message;
    }
    alert(errorMessage);
  }
});

// Sign out
document.getElementById('signOutBtn').addEventListener('click', async () => {
  try {
    await signOut(auth);
    console.log('Successfully signed out');
  } catch (error) {
    console.error('Error signing out:', error);
  }
});

// Header sign out button
document.getElementById('headerSignOutBtn').addEventListener('click', async () => {
  try {
    await signOut(auth);
    console.log('Successfully signed out');
  } catch (error) {
    console.error('Error signing out:', error);
  }
});

// Forgot password functionality
document.getElementById('forgotPasswordBtn').addEventListener('click', async (e) => {
  e.preventDefault();
  
  const emailInput = document.getElementById('modalEmail');
  const email = emailInput.value.trim();
  
  if (!email) {
    alert('Please enter your email address first');
    emailInput.focus();
    return;
  }
  
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert('Please enter a valid email address');
    emailInput.focus();
    return;
  }
  
  try {
    await sendPasswordResetEmail(auth, email);
    alert(`Password reset email sent to ${email}. Please check your inbox and follow the instructions to reset your password.`);
    hideAuthModal();
  } catch (error) {
    console.error('Error sending password reset email:', error);
    
    let errorMessage = 'Failed to send password reset email: ';
    switch (error.code) {
      case 'auth/user-not-found':
        errorMessage += 'No account found with this email address.';
        break;
      case 'auth/invalid-email':
        errorMessage += 'Invalid email address.';
        break;
      case 'auth/too-many-requests':
        errorMessage += 'Too many requests. Please try again later.';
        break;
      default:
        errorMessage += error.message;
    }
    alert(errorMessage);
  }
});

// Simple function to update subscription status (for manual updates after payment)
async function updateSubscriptionStatus(userId, subscribed = true) {
  try {
    await setDoc(doc(db, 'users', userId), {
      subscribed: subscribed,
      subscriptionUpdatedAt: serverTimestamp()
    }, { merge: true });
    console.log(`Updated subscription status for user: ${userId}`);
  } catch (error) {
    console.error('Error updating subscription:', error);
  }
}

// Handle subscription
document.getElementById('subscribeBtn').addEventListener('click', async () => {
  const user = getAuth(app).currentUser;
  if (!user) {
    alert('Please sign in first');
    return;
  }

  // Check if user is already subscribed
  const usage = await getUserUsage(user.uid);
  
  if (usage.subscribed) {
    // For existing subscribers - redirect to Stripe Customer Portal
    window.open('https://billing.stripe.com/p/login/8x228j89U5z59lF1xL43S00', '_blank');
  } else {
    // For new subscribers - redirect to Stripe Payment Link
    window.open('https://buy.stripe.com/8x228j89U5z59lF1xL43S00', '_blank');
  }
});

function extractInfo(text) {
  const parsed = chrono.parse(text);
  if (parsed.length === 0) return null;

  const result = parsed[0];
  const datetime = result.start.date();

  if (result.start.isCertain("day") && !result.start.isCertain("hour")) {
    datetime.setHours(18);
    datetime.setMinutes(0);
  }

  const locationMatch = text.match(
    /(?:in|at)\s+([\w\s,&-]{1,50}?)(?=\s+(on|at|by|next|this|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|$))/i
  );
  const location = locationMatch ? locationMatch[1].trim() : "";

  const title = text
    .replace(result.text, "")
    .replace(/(?:in|at)\s+[A-Z][\w\s\d\-&,]+/i, "")
    .replace(/[\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    title: title || "Untitled Event",
    datetime,
    location,
  };
}

document.addEventListener("DOMContentLoaded", () => {
  const calendarSelect = document.getElementById("calendarSelect");

  chrome.identity.getAuthToken({ interactive: true }, (token) => {
    if (chrome.runtime.lastError) {
      console.error("OAuth error", chrome.runtime.lastError, chrome.runtime.lastError && chrome.runtime.lastError.message);
      return;
    }

    fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        calendarSelect.innerHTML = "";
        
        if (!data.items || data.items.length === 0) {
          calendarSelect.innerHTML = "<option disabled selected>No calendars found</option>";
          return;
        }
        
        // Sort calendars to put primary first
        const sortedCalendars = data.items.sort((a, b) => {
          if (a.primary) return -1;
          if (b.primary) return 1;
          return 0;
        });
        
        sortedCalendars.forEach((cal, index) => {
          const opt = document.createElement("option");
          opt.value = cal.id;
          opt.textContent = cal.summary + (cal.primary ? " (Primary)" : "");
          // Auto-select the first calendar (primary calendar if available)
          if (index === 0) {
            opt.selected = true;
          }
          calendarSelect.appendChild(opt);
        });
        
        console.log("Loaded calendars:", sortedCalendars.length, "calendars"); // Debug info
      })
      .catch((err) => {
        calendarSelect.innerHTML =
          "<option disabled>Error loading calendars</option>";
        console.error("Failed to load calendars", err);
      });

    document.getElementById("addEvent").addEventListener("click", () => {
      const info = window.latestParsed;
      const calendarSelect = document.getElementById("calendarSelect");
      const calendarId = calendarSelect.value;
      const reviewMode = document.getElementById("reviewMode").checked;

      console.log("Selected calendar ID:", calendarId); // Debug info
      console.log("Selected calendar name:", calendarSelect.selectedOptions[0]?.text); // Debug info
      console.log("Available calendars:", calendarSelect.options); // Debug info

      if (!info || !calendarId || calendarId === "") {
        alert("❌ Please parse an event and select a calendar.");
        console.error("Missing info or calendar ID:", { info: !!info, calendarId });
        return;
      }

      const { title, startTime, endTime, location } = info;
      const startDateObj = startTime instanceof Date ? startTime : new Date(startTime);
      const endDateObj = endTime ? (endTime instanceof Date ? endTime : new Date(endTime)) : null;
      const isAllDay = document.getElementById("allDayToggle").checked;

      if (reviewMode) {
        // 👉 Open Google Calendar pre-filled tab
        let isoStart, isoEnd;
        if (isAllDay) {
          isoStart = startDateObj.toISOString().split("T")[0].replace(/-/g, "");
          isoEnd = endDateObj ? 
            endDateObj.toISOString().split("T")[0].replace(/-/g, "") :
            new Date(startDateObj.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0].replace(/-/g, "");
        } else {
          isoStart = startDateObj.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
          isoEnd = endDateObj ? 
            endDateObj.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z" :
            new Date(startDateObj.getTime() + 60 * 60 * 1000).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
        }

        // Try alternative Google Calendar URL format
        const selectedCalendarName = calendarSelect.selectedOptions[0]?.text || "Unknown Calendar";
        const gcalUrl =
          `https://calendar.google.com/calendar/render` +
          `?action=TEMPLATE` +
          `&text=${encodeURIComponent(title)}` +
          `&dates=${isoStart}/${isoEnd}` +
          `&location=${encodeURIComponent(location)}` +
          `&details=${encodeURIComponent(`Created via Smart Event Parser\n\nNote: Please ensure this event is being created in: ${selectedCalendarName}`)}` +
          `&src=${encodeURIComponent(calendarId)}`;

        console.log("Review mode URL (alternative):", gcalUrl); // Debug info
        console.log("Target calendar:", selectedCalendarName); // Debug info
        chrome.tabs.create({ url: gcalUrl });
      } else {
        // ✅ Auto-add via Google Calendar API
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
          const event = {
            summary: title,
            location,
            start: isAllDay
              ? { date: startDateObj.toISOString().split("T")[0] }
              : { dateTime: startDateObj.toISOString() },
            end: isAllDay
              ? { 
                  date: endDateObj ? 
                    endDateObj.toISOString().split("T")[0] :
                    new Date(startDateObj.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0]
                }
              : { 
                  dateTime: endDateObj ? 
                    endDateObj.toISOString() :
                    new Date(startDateObj.getTime() + 60 * 60 * 1000).toISOString()
                },
          };

          console.log("Creating event in calendar:", calendarId);
          console.log("Event data:", event);
          console.log("API URL:", `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);

          fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(event),
            }
          )
            .then((res) => {
              console.log("API Response status:", res.status);
              console.log("API Response headers:", res.headers);
              return res.json();
            })
            .then((responseData) => {
              console.log("API Response data:", responseData);
              if (responseData.error) {
                console.error("Calendar API Error:", responseData.error);
                alert(`❌ Failed to add event: ${responseData.error.message}`);
              } else {
                console.log("Event created successfully:", responseData);
                alert(`✅ Event "${title}" added to calendar: ${document.getElementById("calendarSelect").selectedOptions[0].text}`);
              }
            })
            .catch((err) => {
              console.error("❌ Failed to add event", err);
              alert("❌ Failed to add event: " + err.message);
            });
        });
      }
    });
  });

  chrome.storage.local.get("selectedText", (data) => {
    const eventText = data.selectedText || "";
    document.getElementById("eventText").value = eventText;
    document.getElementById("eventText").focus();
  });

  // Auto-save manually typed text to storage
  document.getElementById("eventText").addEventListener("input", (e) => {
    const text = e.target.value;
    chrome.storage.local.set({ "selectedText": text });
  });

  // Also save when text loses focus
  document.getElementById("eventText").addEventListener("blur", (e) => {
    const text = e.target.value;
    chrome.storage.local.set({ "selectedText": text });
  });

  document.getElementById("parse").addEventListener("click", async () => {
    const user = getAuth(app).currentUser;
    
    // Check if user is signed in
    if (!user) {
      alert('Please sign in to use the event parser');
      return;
    }
    
    // Check usage limits
    const usage = await getUserUsage(user.uid);
    const FREE_LIMIT = 5;
    
    if (!usage.subscribed && usage.requestsUsed >= FREE_LIMIT) {
      alert('You have reached the free limit of 5 requests. Please upgrade to Pro for unlimited requests!');
      return;
    }
    
    const text = document.getElementById("eventText").value;
    
    if (!text.trim()) {
      alert('Please enter some text to parse');
      return;
    }

    try {
      // Update usage count first
      await updateUserUsage(user.uid);
      
      // Prepare request data
      const now = new Date();
      const requestData = {
        text,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        currentTime: new Date().toISOString(),
        // Add local date information
        localDate: now.toLocaleDateString('en-CA'), // YYYY-MM-DD format in local timezone
        localTime: now.toLocaleTimeString('en-US', { hour12: false }),
        localDateTime: now.toString()
      };
      
      // Debug logging
      console.log('Frontend sending to backend:', requestData);
      console.log('Current local time:', new Date().toString());
      console.log('Current UTC time:', new Date().toISOString());
      
      // Make the API request
      const response = await fetch(
        "https://event-parser-backend-jh5a26t40-aitzazs-projects.vercel.app/api/parse",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestData),
        }
      );
      
      const result = await response.json();
      
      // Handle both old format (datetime) and new format (startTime/endTime)
      let title, startTime, endTime, location;
      
      if (result.datetime) {
        // Old API format
        title = result.title;
        startTime = new Date(result.datetime);
        endTime = null; // Old format doesn't support end time
        location = result.location;
      } else {
        // New API format
        title = result.title;
        startTime = new Date(result.startTime);
        endTime = result.endTime ? new Date(result.endTime) : null;
        location = result.location;
      }
      
      const resultElement = document.getElementById("result");
      resultElement.classList.remove("hidden");
      
      let displayText = `📅 Event: ${title}\n🕒 Start: ${startTime.toLocaleString()}`;
      if (endTime) {
        displayText += `\n⏰ End: ${endTime.toLocaleString()}`;
      }
      displayText += `\n📍 Location: ${location || 'No location specified'}`;
      
      resultElement.innerText = displayText;
      window.latestParsed = { 
        title, 
        startTime: startTime, 
        endTime: endTime, 
        location 
      };
      
      // Update usage display
      const newUsage = await getUserUsage(user.uid);
      updateUsageDisplay(newUsage.requestsUsed, newUsage.subscribed);
      
    } catch (err) {
      console.error(err);
      const resultElement = document.getElementById("result");
      resultElement.classList.remove("hidden");
      resultElement.innerText = "❌ Failed to reach backend. Please try again.";
    }
  });
});

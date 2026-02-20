// Payment Backend - Node.js + Stripe Integration
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const https = require('https');
const admin = require('firebase-admin');

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ ERROR: STRIPE_SECRET_KEY not found in .env file!');
  process.exit(1);
}

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const app = express();

// Initialize Firebase Admin
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✅ Firebase Admin initialized');
} else {
  console.warn('⚠️ Firebase Admin not initialized - credits won\'t be added');
}

const db = admin.firestore();

app.use(express.json());
app.use(cors({
  origin: [
    'http://localhost:5500', 
    'http://127.0.0.1:5500', 
    'https://healthxray.online', 
    'https://www.healthxray.online',
    'https://imaginative-alpaca-cf9fb7.netlify.app'
  ],
  credentials: true
}));

const PACKAGES = {
  silver: { price: 1999, name: 'Silver Package', credits: 100 },
  security: { price: 2499, name: 'Security Package', credits: 150 },
  gold: { price: 2999, name: 'Gold Package', credits: 200 },
  boost: { price: 3499, name: 'Boost Package', credits: 250 },
  platinum: { price: 4999, name: 'Platinum Package', credits: 500 },
  vip: { price: 5999, name: 'VIP Package', credits: 1000 }
};

// Add credits to user
async function addCreditsToUser(email, credits, packageName) {
  try {
    // Find user by email
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('email', '==', email).limit(1).get();
    
    if (snapshot.empty) {
      console.error('❌ User not found:', email);
      return false;
    }

    const userDoc = snapshot.docs[0];
    const currentCredits = userDoc.data().credits || 0;
    const newCredits = currentCredits + credits;

    await userDoc.ref.update({
      credits: newCredits,
      lastPurchase: admin.firestore.FieldValue.serverTimestamp(),
      lastPackage: packageName
    });

    console.log(`✅ Added ${credits} credits to ${email}. New balance: ${newCredits}`);
    return true;
  } catch (error) {
    console.error('❌ Error adding credits:', error);
    return false;
  }
}

// Brevo Email Function
function sendEmail(to, subject, htmlContent) {
  const data = JSON.stringify({
    sender: { name: 'HealthXRay', email: 'noreply@healthxray.online' },
    to: [{ email: to }],
    subject: subject,
    htmlContent: htmlContent
  });

  const options = {
    hostname: 'api.brevo.com',
    path: '/v3/smtp/email',
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
      'Content-Length': data.length
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 201) {
          console.log('✅ Email sent to:', to);
          resolve(true);
        } else {
          console.error('❌ Email failed:', body);
          reject(new Error(body));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Welcome Email Template
function sendWelcomeEmail(email, name) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #e83e8c 0%, #ff7e5f 100%); color: white; padding: 40px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 32px; }
        .content { padding: 40px 30px; color: #333; }
        .content h2 { color: #e83e8c; margin-top: 0; }
        .content p { line-height: 1.6; font-size: 16px; }
        .btn { display: inline-block; background: linear-gradient(135deg, #e83e8c 0%, #ff7e5f 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 50px; margin: 20px 0; font-weight: bold; }
        .footer { background: #f9f9f9; padding: 20px; text-align: center; color: #999; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🏥 Welcome to HealthXRay!</h1>
        </div>
        <div class="content">
          <h2>Hello ${name}! 👋</h2>
          <p>Thank you for joining HealthXRay - your trusted health companion!</p>
          <p>We're excited to have you on board. With HealthXRay, you can:</p>
          <ul>
            <li>✅ Track your health metrics</li>
            <li>✅ Calculate BMI, calories, and more</li>
            <li>✅ Get personalized health insights</li>
            <li>✅ Access premium health tools</li>
          </ul>
          <p>Start exploring our health calculators and tools today!</p>
          <a href="https://healthxray.online" class="btn">Explore HealthXRay</a>
          <p>If you have any questions, feel free to reach out to our support team.</p>
        </div>
        <div class="footer">
          <p>© 2024 HealthXRay. All rights reserved.</p>
          <p>Your Health, Our Priority 💚</p>
        </div>
      </div>
    </body>
    </html>
  `;
  return sendEmail(email, '🎉 Welcome to HealthXRay!', html);
}

// Purchase Confirmation Email Template
function sendPurchaseEmail(email, packageName, amount) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #e83e8c 0%, #ff7e5f 100%); color: white; padding: 40px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 32px; }
        .content { padding: 40px 30px; color: #333; }
        .content h2 { color: #e83e8c; margin-top: 0; }
        .content p { line-height: 1.6; font-size: 16px; }
        .package-box { background: #f9f9f9; border-left: 4px solid #e83e8c; padding: 20px; margin: 20px 0; border-radius: 5px; }
        .package-box h3 { margin: 0 0 10px 0; color: #e83e8c; }
        .package-box p { margin: 5px 0; }
        .btn { display: inline-block; background: linear-gradient(135deg, #e83e8c 0%, #ff7e5f 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 50px; margin: 20px 0; font-weight: bold; }
        .footer { background: #f9f9f9; padding: 20px; text-align: center; color: #999; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Payment Successful!</h1>
        </div>
        <div class="content">
          <h2>Thank You for Your Purchase! 🎉</h2>
          <p>Your subscription has been activated successfully.</p>
          <div class="package-box">
            <h3>📦 Order Details</h3>
            <p><strong>Package:</strong> ${packageName}</p>
            <p><strong>Amount:</strong> $${(amount / 100).toFixed(2)}/month</p>
            <p><strong>Status:</strong> Active ✅</p>
          </div>
          <p>You now have access to all premium features included in your ${packageName}.</p>
          <a href="https://healthxray.online" class="btn">Access Your Dashboard</a>
          <p>Your subscription will automatically renew monthly. You can manage or cancel your subscription anytime.</p>
          <p>Need help? Contact our support team - we're here for you!</p>
        </div>
        <div class="footer">
          <p>© 2024 HealthXRay. All rights reserved.</p>
          <p>Your Health, Our Priority 💚</p>
        </div>
      </div>
    </body>
    </html>
  `;
  return sendEmail(email, `✅ ${packageName} - Payment Confirmed`, html);
}

app.post('/create-checkout-session', async (req, res) => {
  const { packageType } = req.body;
  const pkg = PACKAGES[packageType];

  if (!pkg) return res.status(400).json({ error: 'Invalid package' });

  try {
    const origin = req.headers.origin || 'https://healthxray.online';
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: pkg.name },
          unit_amount: pkg.price,
          recurring: { interval: 'month' }
        },
        quantity: 1
      }],
      mode: 'subscription',
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/premium.html`,
      metadata: {
        package: packageType
      }
    });

    console.log('✅ Checkout session created:', session.id);
    res.json({ url: session.url });
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook endpoint for Stripe events
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('⚠️ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      console.log('✅ Payment successful:', session.id);
      console.log('Customer email:', session.customer_email);
      console.log('Package:', session.metadata.package);
      
      // Send purchase confirmation email & add credits
      if (session.customer_email && session.metadata.package) {
        const pkg = PACKAGES[session.metadata.package];
        
        // Send email
        sendPurchaseEmail(session.customer_email, pkg.name, pkg.price)
          .catch(err => console.error('Email error:', err));
        
        // Add credits
        addCreditsToUser(session.customer_email, pkg.credits, pkg.name)
          .catch(err => console.error('Credits error:', err));
      }
      break;

    case 'customer.subscription.created':
      const subscription = event.data.object;
      console.log('✅ Subscription created:', subscription.id);
      break;

    case 'customer.subscription.deleted':
      const deletedSub = event.data.object;
      console.log('❌ Subscription cancelled:', deletedSub.id);
      break;

    case 'invoice.payment_succeeded':
      const invoice = event.data.object;
      console.log('✅ Payment succeeded:', invoice.id);
      break;

    case 'invoice.payment_failed':
      const failedInvoice = event.data.object;
      console.log('❌ Payment failed:', failedInvoice.id);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({received: true});
});

// Verify payment session
app.get('/verify-session/:sessionId', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    res.json({
      status: session.payment_status,
      customer_email: session.customer_email,
      amount_total: session.amount_total
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Welcome email endpoint for new signups
app.post('/send-welcome-email', async (req, res) => {
  const { email, name } = req.body;
  
  if (!email || !name) {
    return res.status(400).json({ error: 'Email and name required' });
  }
  
  try {
    await sendWelcomeEmail(email, name);
    res.json({ success: true, message: 'Welcome email sent' });
  } catch (error) {
    console.error('Welcome email error:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'running', 
    message: 'HealthXRay Payment Backend',
    endpoints: ['/create-checkout-session', '/send-welcome-email']
  });
});

// Handle preflight requests
app.options('*', cors());

const PORT = process.env.PORT || 3000;

// Keep-alive ping to prevent sleeping
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    https.get(`https://gateway-y53s.onrender.com/`, (res) => {
      console.log('✅ Keep-alive ping:', res.statusCode);
    }).on('error', (err) => {
      console.error('❌ Keep-alive error:', err.message);
    });
  }, 14 * 60 * 1000); // Ping every 14 minutes
}

app.listen(PORT, () => {
  console.log('\n✅ Backend server is running!');
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log('\n📝 Next steps:');
  console.log('   1. Open premium.html in browser');
  console.log('   2. Click any Subscribe button');
  console.log('   3. Use test card: 4242 4242 4242 4242\n');
});

// Payment Backend - Node.js + Stripe Integration
require('dotenv').config();
const express = require('express');
const cors = require('cors');

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ ERROR: STRIPE_SECRET_KEY not found in .env file!');
  process.exit(1);
}

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const app = express();

app.use(express.json());
app.use(cors({
  origin: ['http://localhost:5500', 'http://127.0.0.1:5500', 'https://healthxray.online', 'https://www.healthxray.online'],
  credentials: true
}));

const PACKAGES = {
  silver: { price: 1999, name: 'Silver Package' },
  security: { price: 2499, name: 'Security Package' },
  gold: { price: 2999, name: 'Gold Package' },
  boost: { price: 3499, name: 'Boost Package' },
  platinum: { price: 4999, name: 'Platinum Package' },
  vip: { price: 5999, name: 'VIP Package' }
};

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
      cancel_url: `${origin}/premium.html`
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({ 
    status: 'running', 
    message: 'HealthXRay Payment Backend',
    endpoints: ['/create-checkout-session']
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('\n✅ Backend server is running!');
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log('\n📝 Next steps:');
  console.log('   1. Open premium.html in browser');
  console.log('   2. Click any Subscribe button');
  console.log('   3. Use test card: 4242 4242 4242 4242\n');
});

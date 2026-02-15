#!/usr/bin/env node
/**
 * Stripe Product & Price Setup Script
 *
 * This script creates the MaximaCoach subscription products and prices in Stripe.
 * Run with: STRIPE_SECRET_KEY=sk_test_... node scripts/setup-stripe.js
 */

import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.error('❌ Error: STRIPE_SECRET_KEY environment variable is required');
  console.log('\nUsage:');
  console.log('  STRIPE_SECRET_KEY=sk_test_... node scripts/setup-stripe.js');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2026-01-28.clover' });

const plans = [
  {
    name: 'Starter',
    key: 'starter',
    price: 29900, // $299.00 in cents
    description: 'Up to 5 reps, 15 sessions/rep/month (75 pool). Core scenarios, basic dashboard, animated orb, email support.',
    features: [
      'Up to 5 reps',
      '15 sessions/rep/month (75 pool)',
      'Core scenarios (cold call, objection handling, discovery, closing)',
      'Basic rep dashboard with scoring',
      'Animated orb visualization',
      'Email support',
    ],
  },
  {
    name: 'Growth',
    key: 'growth',
    price: 59900, // $599.00 in cents
    description: 'Up to 15 reps, 15 sessions/rep/month (225 pool). Everything in Starter plus weekly leaderboards, team challenges, manager dashboard, clip sharing, Slack notifications.',
    features: [
      'Up to 15 reps',
      '15 sessions/rep/month (225 pool)',
      'Everything in Starter',
      'Weekly leaderboards',
      'Team challenges',
      'Manager dashboard with team analytics',
      'Clip sharing & team feed',
      'Slack notifications',
      'Priority support',
    ],
  },
  {
    name: 'Scale',
    key: 'scale',
    price: 99900, // $999.00 in cents
    description: 'Up to 30 reps, 20 sessions/rep/month (600 pool). Everything in Growth plus head-to-head mode, custom scenarios, CRM integration, advanced analytics.',
    features: [
      'Up to 30 reps',
      '20 sessions/rep/month (600 pool)',
      'Everything in Growth',
      'Head-to-head mode',
      'Custom scenario builder',
      'CRM integration (HubSpot, Salesforce)',
      'Advanced analytics & reporting',
      'Dedicated success manager',
    ],
  },
  {
    name: 'Enterprise',
    key: 'enterprise',
    price: 150000, // $1,500.00+ in cents (starting price)
    description: '30+ reps, unlimited sessions. Everything in Scale plus company-wide tournaments, SSO/SAML, custom persona library, API access.',
    features: [
      '30+ reps (negotiated)',
      'Unlimited sessions',
      'Everything in Scale',
      'Company-wide tournaments',
      'SSO/SAML',
      'Custom persona library',
      'API access',
      'Quarterly business reviews',
    ],
  },
];

async function createProducts() {
  console.log('🚀 Creating MaximaCoach subscription products in Stripe...\n');

  const results = {};

  for (const plan of plans) {
    try {
      console.log(`📦 Creating product: ${plan.name}...`);

      // Create product
      const product = await stripe.products.create({
        name: `MaximaCoach ${plan.name}`,
        description: plan.description,
        metadata: {
          plan_key: plan.key,
        },
      });

      console.log(`   ✅ Product created: ${product.id}`);

      // Create recurring price
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.price,
        currency: 'usd',
        recurring: {
          interval: 'month',
        },
        metadata: {
          plan_key: plan.key,
        },
      });

      console.log(`   ✅ Price created: ${price.id}`);
      console.log(`   💰 ${plan.name}: $${(plan.price / 100).toFixed(2)}/month\n`);

      results[plan.key] = {
        product_id: product.id,
        price_id: price.id,
      };
    } catch (error) {
      console.error(`   ❌ Error creating ${plan.name}:`, error.message);
    }
  }

  console.log('\n✨ Setup complete!\n');
  console.log('📋 Add these environment variables to your DigitalOcean App Platform:\n');
  console.log(`STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}`);
  console.log(`STRIPE_STARTER_PRICE_ID=${results.starter?.price_id || 'ERROR'}`);
  console.log(`STRIPE_GROWTH_PRICE_ID=${results.growth?.price_id || 'ERROR'}`);
  console.log(`STRIPE_SCALE_PRICE_ID=${results.scale?.price_id || 'ERROR'}`);
  console.log(`STRIPE_ENTERPRISE_PRICE_ID=${results.enterprise?.price_id || 'ERROR'}\n`);

  console.log('🔗 Next steps:');
  console.log('1. Set up webhook endpoint in Stripe Dashboard');
  console.log('2. Add STRIPE_WEBHOOK_SECRET to your environment variables');
  console.log('3. Test checkout flow in your application\n');

  return results;
}

createProducts().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

-- Daily Training Loop: Skill Categories, Drills, Daily Plans
-- =========================================================

-- ── Skill categories ─────────────────────────────────────────

CREATE TABLE skill_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL DEFAULT '📊',
  sort_order int NOT NULL DEFAULT 0
);

INSERT INTO skill_categories (slug, name, description, icon, sort_order) VALUES
  ('rapport',          'Rapport Building',     'Building trust and connection with prospects',           '🤝', 1),
  ('discovery',        'Discovery',            'Asking probing questions to uncover needs and pain',     '🔍', 2),
  ('objection',        'Objection Handling',    'Addressing concerns and overcoming resistance',          '🛡️', 3),
  ('closing',          'Closing',              'Asking for the business and negotiating terms',           '🎯', 4),
  ('value_prop',       'Value Proposition',     'Articulating product value aligned to buyer needs',      '💎', 5),
  ('active_listening', 'Active Listening',      'Demonstrating attentiveness and comprehension',          '👂', 6);

-- ── Drills ───────────────────────────────────────────────────

CREATE TABLE drills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL = system drill
  title text NOT NULL,
  description text NOT NULL,
  skill_category_id uuid NOT NULL REFERENCES skill_categories(id),
  scenario_type text CHECK (scenario_type IN ('cold_call', 'discovery', 'objection_handling', 'closing')),
  difficulty int NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 10),
  time_limit_seconds int NOT NULL DEFAULT 120,
  instructions text NOT NULL,
  system_prompt text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_drills_skill ON drills (skill_category_id);
CREATE INDEX idx_drills_org ON drills (org_id) WHERE org_id IS NOT NULL;

-- ── Seed system drills ───────────────────────────────────────

-- Rapport Building drills
INSERT INTO drills (title, description, skill_category_id, scenario_type, difficulty, time_limit_seconds, instructions, is_system)
SELECT
  d.title, d.description,
  (SELECT id FROM skill_categories WHERE slug = d.skill_slug),
  d.scenario_type, d.difficulty, d.time_limit, d.instructions, true
FROM (VALUES
  ('Warm Opener',
   'Practice opening a cold call with a warm, personalized hook.',
   'rapport', 'cold_call', 2, 60,
   'Open a cold call to a VP of Sales. Reference something specific about their company (a recent funding round, job posting, or news article). Goal: get them to stay on the line for 30+ seconds.'),
  ('Find Common Ground',
   'Build rapport by discovering shared interests or experiences.',
   'rapport', 'discovery', 3, 90,
   'You''re 5 minutes into a discovery call. Transition from business talk to finding a personal connection point. Keep it natural, not forced.'),
  ('Mirroring Technique',
   'Practice matching the prospect''s communication style.',
   'rapport', 'cold_call', 4, 90,
   'The prospect is formal and data-driven. Match their communication style while still being personable. Practice using their language and phrasing patterns.'),
  -- Discovery drills
  ('SPIN Questions',
   'Practice Situation, Problem, Implication, Need-Payoff questioning.',
   'discovery', 'discovery', 3, 120,
   'Run through a complete SPIN sequence with a prospect who knows they have a problem but hasn''t quantified the impact. Extract at least 2 implications.'),
  ('Pain Deep Dive',
   'Dig 3 levels deep into a business pain point.',
   'discovery', 'discovery', 5, 120,
   'The prospect mentions they''re "not happy with their current solution." Go 3 levels deep: What specifically? What''s the impact? What happens if nothing changes?'),
  ('Budget Discovery',
   'Tactfully uncover budget constraints and decision process.',
   'discovery', 'discovery', 6, 90,
   'You need to understand the budget and buying process without being pushy. The prospect is evasive about money. Navigate to clear answers.'),
  -- Objection Handling drills
  ('Price Too High',
   'Handle the classic "it''s too expensive" objection.',
   'objection', 'objection_handling', 3, 90,
   'The prospect says "I like the product but the price is too high." Use the feel-felt-found method or value reframing to address without immediately discounting.'),
  ('Happy with Current',
   'Overcome "we''re happy with our current vendor" resistance.',
   'objection', 'objection_handling', 5, 90,
   'The prospect says "We already have a solution and we''re happy with it." Find a crack — something they wish was better. Don''t bash the competitor.'),
  ('Need to Think About It',
   'Address the stall tactic without being pushy.',
   'objection', 'objection_handling', 4, 90,
   'After a good demo, the prospect says "Let me think about it and get back to you." Isolate the real concern without being aggressive. Set a concrete next step.'),
  ('No Budget Right Now',
   'Navigate around timing and budget constraints.',
   'objection', 'objection_handling', 6, 120,
   'The prospect loves the product but says "We don''t have budget until next quarter." Explore creative options: phased rollout, POC, reallocating existing budget.'),
  -- Closing drills
  ('Trial Close',
   'Practice checking buying temperature throughout the conversation.',
   'closing', 'closing', 2, 60,
   'Practice 3 different trial close techniques during a late-stage conversation. Gauge interest without being pushy. Read the response and adapt.'),
  ('Assumptive Close',
   'Use assumption to move toward commitment.',
   'closing', 'closing', 4, 90,
   'The demo went well, stakeholders are aligned. Use an assumptive close approach: "When would you like to start onboarding?" Navigate any pushback.'),
  ('Negotiation Anchor',
   'Set and defend your pricing anchor.',
   'closing', 'closing', 7, 120,
   'The prospect asks for a 30% discount. Present your initial offer with confidence, justify the value, and negotiate to no more than 10% off.'),
  ('Multi-Stakeholder Close',
   'Close when multiple decision makers are involved.',
   'closing', 'closing', 8, 120,
   'You have buy-in from the champion but the CFO and VP of Ops need to approve. Build a closing strategy that arms your champion with what they need.'),
  -- Value Proposition drills
  ('30-Second Pitch',
   'Deliver a compelling value prop in under 30 seconds.',
   'value_prop', 'cold_call', 2, 30,
   'You have 30 seconds to explain your product''s value to a busy executive. Be specific about outcomes, not features. Include a quantified result.'),
  ('Competitive Differentiation',
   'Articulate why you''re better without bashing competitors.',
   'value_prop', 'discovery', 5, 90,
   'The prospect asks "How are you different from [Competitor]?" Differentiate on value, not features. Focus on unique outcomes you deliver.'),
  ('ROI Story',
   'Build a compelling ROI narrative with real numbers.',
   'value_prop', 'closing', 6, 120,
   'Build an ROI case for a $50K/year solution. Use the prospect''s own numbers (which you''ll need to extract) to show 3x+ return.'),
  -- Active Listening drills
  ('Summarize and Confirm',
   'Practice active listening by summarizing what you heard.',
   'active_listening', 'discovery', 2, 90,
   'After the prospect shares their situation, summarize it back to them in your own words. Confirm you got it right. Ask what you missed.'),
  ('Emotional Labeling',
   'Identify and acknowledge the prospect''s emotions.',
   'active_listening', 'objection_handling', 5, 90,
   'The prospect is frustrated about a previous bad experience with a similar product. Use emotional labeling: "It sounds like you''re frustrated because..." Validate, don''t dismiss.'),
  ('Strategic Silence',
   'Use intentional pauses to let the prospect fill the gap.',
   'active_listening', 'discovery', 4, 120,
   'Practice asking a deep question and then staying silent for at least 5 seconds. Let the prospect think and share more than they initially planned.')
) AS d(title, description, skill_slug, scenario_type, difficulty, time_limit, instructions);

-- ── Daily training plans ─────────────────────────────────────

CREATE TABLE daily_training_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  drills jsonb NOT NULL DEFAULT '[]',
  -- drills format: [{drill_id, title, skill_category, difficulty, status: "pending"|"completed", completed_at, xp_earned}]
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, plan_date)
);

CREATE INDEX idx_daily_plans_user_date ON daily_training_plans (user_id, plan_date DESC);

-- ── RLS policies ─────────────────────────────────────────────

ALTER TABLE skill_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Skill categories are readable by authenticated users"
  ON skill_categories FOR SELECT TO authenticated USING (true);

ALTER TABLE drills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "System drills are readable by all authenticated users"
  ON drills FOR SELECT TO authenticated USING (is_system = true);
CREATE POLICY "Org drills are readable by org members"
  ON drills FOR SELECT USING (
    org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  );
CREATE POLICY "Service role can manage drills"
  ON drills FOR ALL WITH CHECK (true);

ALTER TABLE daily_training_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own daily plans"
  ON daily_training_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage daily plans"
  ON daily_training_plans FOR ALL WITH CHECK (true);

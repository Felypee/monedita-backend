-- ================================================
-- MIGRATION: Sistema de Moneditas (Febrero 2026)
-- Ejecutar en Supabase SQL Editor
-- ================================================

-- 1. Agregar columnas nuevas a subscription_plans
ALTER TABLE subscription_plans
ADD COLUMN IF NOT EXISTS moneditas_monthly INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS history_days INTEGER DEFAULT 30;

-- 2. Actualizar los planes con los nuevos valores
UPDATE subscription_plans SET
  moneditas_monthly = 50,
  history_days = 30,
  limit_budgets = -1,        -- Presupuestos ilimitados para todos
  can_export_csv = true      -- CSV para todos
WHERE id = 'free';

UPDATE subscription_plans SET
  moneditas_monthly = 1200,
  history_days = 180,
  limit_budgets = -1,
  can_export_csv = true,
  can_export_pdf = true
WHERE id = 'basic';

UPDATE subscription_plans SET
  moneditas_monthly = 3500,
  history_days = 365,
  limit_budgets = -1,
  can_export_csv = true,
  can_export_pdf = true
WHERE id = 'premium';

-- 3. Crear tabla para tracking de moneditas
CREATE TABLE IF NOT EXISTS moneditas_usage (
  id SERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  moneditas_used INTEGER DEFAULT 0,
  moneditas_limit INTEGER NOT NULL,
  last_operation TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(phone, period_start)
);

-- 4. Crear índices para moneditas_usage
CREATE INDEX IF NOT EXISTS idx_moneditas_usage_phone
  ON moneditas_usage(phone);
CREATE INDEX IF NOT EXISTS idx_moneditas_usage_phone_period
  ON moneditas_usage(phone, period_start);

-- 5. Crear vista para status de moneditas
CREATE OR REPLACE VIEW user_moneditas_status AS
SELECT
  us.phone,
  us.plan_id,
  sp.name as plan_name,
  sp.moneditas_monthly,
  sp.history_days,
  COALESCE(mu.moneditas_used, 0) as moneditas_used,
  sp.moneditas_monthly - COALESCE(mu.moneditas_used, 0) as moneditas_remaining,
  mu.last_operation,
  sp.can_export_csv,
  sp.can_export_pdf
FROM user_subscriptions us
JOIN subscription_plans sp ON us.plan_id = sp.id
LEFT JOIN moneditas_usage mu ON us.phone = mu.phone
  AND mu.period_start = get_billing_period_start(us.phone)
WHERE us.is_active = true;

-- 6. Verificar que todo está correcto
SELECT id, name, moneditas_monthly, history_days, price_monthly
FROM subscription_plans
ORDER BY price_monthly;

-- Resultado esperado:
-- | id      | name    | moneditas_monthly | history_days | price_monthly |
-- |---------|---------|-------------------|--------------|---------------|
-- | free    | Free    | 50                | 30           | 0             |
-- | basic   | Basic   | 1200              | 180          | 2.99          |
-- | premium | Premium | 3500              | 365          | 7.99          |

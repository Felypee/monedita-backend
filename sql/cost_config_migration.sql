-- ================================================
-- MIGRATION: Tabla de Configuración de Costos
-- Ejecutar en Supabase SQL Editor
-- ================================================

-- Tabla para guardar configuración de costos (key-value)
CREATE TABLE IF NOT EXISTS cost_config (
  key TEXT PRIMARY KEY,
  value DECIMAL(14,6) NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insertar valores de infraestructura
INSERT INTO cost_config (key, value, description) VALUES
  -- Infraestructura fija mensual
  ('infra.hosting_backend', 5, 'Railway/Render - Servidor Node.js ($/mes)'),
  ('infra.hosting_web', 0, 'Hosting web/landing ($/mes)'),
  ('infra.domain', 1.25, 'Dominio anual $15/año = $1.25/mes'),
  ('infra.supabase_free_limit', 50000, 'MAUs del free tier de Supabase'),
  ('infra.supabase_pro_cost', 25, 'Costo mensual si excede free tier ($)'),

  -- WhatsApp (precios Colombia)
  ('whatsapp.fixed_per_user', 2, 'Mensajes fijos por usuario activo'),
  ('whatsapp.cost_per_message', 0.0008, 'Costo por mensaje utility ($)'),

  -- Claude API (Sonnet 4)
  ('claude.input_per_million', 3, 'Costo por millón de tokens input ($)'),
  ('claude.output_per_million', 15, 'Costo por millón de tokens output ($)'),
  ('claude.tokens_text_input', 1400, 'Tokens input por mensaje de texto'),
  ('claude.tokens_text_output', 300, 'Tokens output por mensaje de texto'),
  ('claude.tokens_image_input', 2500, 'Tokens input por imagen'),
  ('claude.tokens_image_output', 150, 'Tokens output por imagen'),
  ('claude.tokens_voice_input', 600, 'Tokens input por audio'),
  ('claude.tokens_voice_output', 150, 'Tokens output por audio'),
  ('claude.tokens_ai_input', 2000, 'Tokens input por conversación AI'),
  ('claude.tokens_ai_output', 500, 'Tokens output por conversación AI'),

  -- Pagos (Wompi)
  ('payments.wompi_fee_percent', 2.99, 'Porcentaje comisión Wompi (%)'),
  ('payments.wompi_fee_fixed_cop', 900, 'Comisión fija Wompi (COP)'),
  ('payments.monedita_cost_usd', 0.002, 'Costo real por monedita (USD)'),
  ('payments.infra_per_user', 0.05, 'Infra prorrateada por usuario (USD)')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Verificar
SELECT * FROM cost_config ORDER BY key;

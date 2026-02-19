/**
 * Tool: Upgrade Info
 * Shows available subscription upgrade options with payment links
 */

import { getMessage } from "../utils/languageUtils.js";
import {
  getSubscriptionStatus,
  getAvailablePlans,
} from "../services/subscriptionService.js";
import {
  createPaymentLink,
  formatPriceCOP,
  SUBSCRIPTION_PLANS,
} from "../services/wompiService.js";

export const definition = {
  name: "upgrade_info",
  description: "Show available subscription plans and upgrade options with payment links. Use when user asks about upgrading, pricing, plans, or wants to pay. Examples: 'upgrade', 'pricing', 'plans', 'quiero pagar', 'mejorar plan'",
  input_schema: {
    type: "object",
    properties: {
      selectedPlan: {
        type: "string",
        description: "If user already specified a plan (basic or premium), generate payment link directly",
        enum: ["basic", "premium"]
      }
    },
    required: []
  }
};

export async function handler(phone, params, lang, userCurrency) {
  try {
    const status = await getSubscriptionStatus(phone);
    const currentPlan = status.plan.id;

    // If user already has premium, nothing to upgrade
    if (currentPlan === "premium") {
      return {
        success: true,
        message: getLocalizedMessage("already_premium", lang)
      };
    }

    // If user selected a specific plan, generate payment link
    if (params.selectedPlan) {
      return await generatePaymentLink(phone, params.selectedPlan, currentPlan, lang);
    }

    // Show available plans
    return {
      success: true,
      message: formatUpgradePlansWithPrices(currentPlan, lang)
    };
  } catch (error) {
    console.error("Error getting upgrade options:", error);
    return { success: false, message: getMessage("error_generic", lang) };
  }
}

/**
 * Generate a payment link for the selected plan
 */
async function generatePaymentLink(phone, planId, currentPlan, lang) {
  // Can't downgrade
  if (planId === "basic" && currentPlan === "basic") {
    return {
      success: false,
      message: getLocalizedMessage("already_on_plan", lang, { plan: "Basic" })
    };
  }

  const plan = SUBSCRIPTION_PLANS[planId];
  if (!plan) {
    return {
      success: false,
      message: getLocalizedMessage("unknown_plan", lang)
    };
  }

  // Create payment link with Wompi
  const result = await createPaymentLink(phone, planId);

  if (!result.success) {
    return {
      success: false,
      message: getLocalizedMessage("payment_error", lang, { error: result.error })
    };
  }

  return {
    success: true,
    message: getLocalizedMessage("payment_link", lang, {
      plan: plan.name,
      price: formatPriceCOP(plan.priceCOP),
      url: result.paymentUrl
    })
  };
}

/**
 * Format upgrade plans with COP prices (using moneditas system)
 */
function formatUpgradePlansWithPrices(currentPlan, lang) {
  const messages = {
    es: `💳 *Planes Disponibles*

${currentPlan === "free" ? `📦 *Basic* - ${formatPriceCOP(SUBSCRIPTION_PLANS.basic.priceCOP)}/mes
• 1,200 moneditas/mes (~240 gastos)
• 6 meses de historial
• Presupuestos ilimitados
• Exportar CSV y PDF

` : ""}🚀 *Premium* - ${formatPriceCOP(SUBSCRIPTION_PLANS.premium.priceCOP)}/mes
• 3,500 moneditas/mes (~700 gastos)
• 12 meses de historial
• Presupuestos ilimitados
• Exportar CSV y PDF

Para pagar, dime:
${currentPlan === "free" ? '• "Quiero Basic"\n' : ""}• "Quiero Premium"`,

    en: `💳 *Available Plans*

${currentPlan === "free" ? `📦 *Basic* - ${formatPriceCOP(SUBSCRIPTION_PLANS.basic.priceCOP)}/month
• 1,200 moneditas/month (~240 expenses)
• 6 months history
• Unlimited budgets
• CSV and PDF export

` : ""}🚀 *Premium* - ${formatPriceCOP(SUBSCRIPTION_PLANS.premium.priceCOP)}/month
• 3,500 moneditas/month (~700 expenses)
• 12 months history
• Unlimited budgets
• CSV and PDF export

To pay, tell me:
${currentPlan === "free" ? '• "I want Basic"\n' : ""}• "I want Premium"`,

    pt: `💳 *Planos Disponíveis*

${currentPlan === "free" ? `📦 *Basic* - ${formatPriceCOP(SUBSCRIPTION_PLANS.basic.priceCOP)}/mês
• 1,200 moneditas/mês (~240 despesas)
• 6 meses de histórico
• Orçamentos ilimitados
• Exportar CSV e PDF

` : ""}🚀 *Premium* - ${formatPriceCOP(SUBSCRIPTION_PLANS.premium.priceCOP)}/mês
• 3,500 moneditas/mês (~700 despesas)
• 12 meses de histórico
• Orçamentos ilimitados
• Exportar CSV e PDF

Para pagar, me diga:
${currentPlan === "free" ? '• "Quero Basic"\n' : ""}• "Quero Premium"`,
  };

  return messages[lang] || messages.es;
}

/**
 * Get localized message
 */
function getLocalizedMessage(key, lang, params = {}) {
  const messages = {
    es: {
      already_premium: "Ya tienes el plan Premium. ¡Gracias por tu apoyo!",
      already_on_plan: "Ya tienes el plan {plan}.",
      unknown_plan: "Plan no reconocido. Los planes disponibles son Basic y Premium.",
      payment_error: "Error generando link de pago: {error}. Por favor intenta de nuevo.",
      payment_link: `💳 *Pagar {plan}*

Precio: *{price}*

Haz clic aquí para pagar de forma segura:
{url}

El link expira en 24 horas.
Tu plan se activará automáticamente al confirmar el pago.`
    },
    en: {
      already_premium: "You already have the Premium plan. Thank you for your support!",
      already_on_plan: "You already have the {plan} plan.",
      unknown_plan: "Plan not recognized. Available plans are Basic and Premium.",
      payment_error: "Error generating payment link: {error}. Please try again.",
      payment_link: `💳 *Pay for {plan}*

Price: *{price}*

Click here to pay securely:
{url}

The link expires in 24 hours.
Your plan will be activated automatically upon payment confirmation.`
    },
    pt: {
      already_premium: "Você já tem o plano Premium. Obrigado pelo seu apoio!",
      already_on_plan: "Você já tem o plano {plan}.",
      unknown_plan: "Plano não reconhecido. Os planos disponíveis são Basic e Premium.",
      payment_error: "Erro ao gerar link de pagamento: {error}. Por favor, tente novamente.",
      payment_link: `💳 *Pagar {plan}*

Preço: *{price}*

Clique aqui para pagar com segurança:
{url}

O link expira em 24 horas.
Seu plano será ativado automaticamente após a confirmação do pagamento.`
    }
  };

  const langMessages = messages[lang] || messages.es;
  let message = langMessages[key] || messages.es[key] || key;

  for (const [param, value] of Object.entries(params)) {
    message = message.replace(new RegExp(`\\{${param}\\}`, "g"), value);
  }

  return message;
}

export default { definition, handler };

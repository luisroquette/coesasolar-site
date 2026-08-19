import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  getStrictCorsHeaders,
  handleCorsPrelight,
} from '../_shared/security-helpers.ts';
import { validateNotificationEmail, parseAndValidate } from '../_shared/zod-schemas.ts';

/**
 * send-notification-email: Internal trigger from pg_net
 * SECURITY: Uses strict CORS + Zod validation
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

interface NotificationPayload {
  notification_id: string;
  admin_user_id: string;
  title: string;
  message: string;
  type: string;
  entity_type?: string;
  entity_id?: string;
  created_by_nome?: string;
}

// Email templates based on notification type
function getEmailTemplate(type: string, title: string, message: string, createdBy?: string): { subject: string; html: string } {
  const baseStyles = `
    <style>
      body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
      .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
      .header { padding: 24px 32px; text-align: center; }
      .header-success { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }
      .header-warning { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }
      .header-info { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); }
      .header-goal { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); }
      .header h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; }
      .content { padding: 32px; }
      .message { font-size: 16px; color: #374151; line-height: 1.6; margin-bottom: 24px; }
      .meta { font-size: 14px; color: #6b7280; padding: 16px; background-color: #f9fafb; border-radius: 6px; }
      .footer { padding: 24px 32px; text-align: center; background-color: #f9fafb; border-top: 1px solid #e5e7eb; }
      .footer p { margin: 0; font-size: 12px; color: #9ca3af; }
      .logo { font-size: 28px; font-weight: 700; color: #ffffff; margin-bottom: 8px; }
      .icon { font-size: 48px; margin-bottom: 16px; }
    </style>
  `;

  let headerClass = 'header-info';
  let icon = '📧';
  let subject = title;

  switch (type) {
    case 'success':
    case 'proposta_aceita':
      headerClass = 'header-success';
      icon = '🎉';
      subject = `✅ ${title}`;
      break;
    case 'goal_achieved':
    case 'meta_atingida':
      headerClass = 'header-goal';
      icon = '🏆';
      subject = `🏆 ${title}`;
      break;
    case 'warning':
    case 'proposta_excluida':
      headerClass = 'header-warning';
      icon = '⚠️';
      subject = `⚠️ ${title}`;
      break;
    case 'proposta_criada':
    case 'info':
    default:
      headerClass = 'header-info';
      icon = '📋';
      subject = `📋 ${title}`;
      break;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      ${baseStyles}
    </head>
    <body>
      <div class="container">
        <div class="header ${headerClass}">
          <div class="icon">${icon}</div>
          <div class="logo">COESA</div>
          <h1>${title}</h1>
        </div>
        <div class="content">
          <p class="message">${message}</p>
          ${createdBy ? `<div class="meta"><strong>Criado por:</strong> ${createdBy}</div>` : ''}
        </div>
        <div class="footer">
          <p>Este é um e-mail automático do Sistema COESA.</p>
          <p>Para gerenciar suas preferências de notificação, acesse as configurações do sistema.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return { subject, html };
}

async function sendEmailWithResend(to: string, subject: string, html: string): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "COESA Sistema <onboarding@resend.dev>",
        to: [to],
        subject: subject,
        html: html,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error("Resend API error:", data);
      return { success: false, error: data.message || "Failed to send email" };
    }

    return { success: true, id: data.id };
  } catch (error: any) {
    console.error("Error calling Resend API:", error);
    return { success: false, error: error.message };
  }
}

serve(async (req) => {
  // Handle CORS preflight requests - Internal API uses strict CORS
  if (req.method === "OPTIONS") {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  const corsHeaders = getStrictCorsHeaders(req);

  try {
    // Validate request body
    const parseResult = await parseAndValidate(req, validateNotificationEmail);
    
    if (!parseResult.success) {
      console.warn("[send-notification-email] Validation failed:", parseResult.error);
      return new Response(
        JSON.stringify({ error: parseResult.error }),
        { status: parseResult.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = parseResult.data;
    console.log("Received notification payload:", payload.notification_id, payload.type);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user email and preferences
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, nome")
      .eq("user_id", payload.admin_user_id)
      .single();

    if (profileError || !profile?.email) {
      console.error("Error fetching profile or no email:", profileError);
      return new Response(
        JSON.stringify({ error: "User email not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check email preferences
    const { data: preferences } = await supabase
      .from("email_preferences")
      .select("*")
      .eq("user_id", payload.admin_user_id)
      .single();

    // If no preferences exist or email is disabled, skip
    if (preferences && !preferences.email_enabled) {
      console.log("Email notifications disabled for user");
      return new Response(
        JSON.stringify({ message: "Email notifications disabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check specific notification type preferences
    const notificationType = payload.type || 'info';
    let shouldSend = true;

    if (preferences) {
      switch (notificationType) {
        case 'success':
          shouldSend = preferences.notify_proposta_aceita !== false;
          break;
        case 'goal_achieved':
          shouldSend = preferences.notify_meta_atingida !== false;
          break;
        case 'warning':
          shouldSend = preferences.notify_proposta_excluida !== false;
          break;
        case 'info':
          shouldSend = preferences.notify_proposta_criada !== false;
          break;
      }
    }

    if (!shouldSend) {
      console.log(`Notification type ${notificationType} disabled for user`);
      return new Response(
        JSON.stringify({ message: "Notification type disabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate email template
    const { subject, html } = getEmailTemplate(
      notificationType,
      payload.title,
      payload.message,
      payload.created_by_nome
    );

    // Send email via Resend API
    const emailResult = await sendEmailWithResend(profile.email, subject, html);
    
    if (!emailResult.success) {
      console.error("Failed to send email:", emailResult.error);
      
      // Log the failed email attempt
      await supabase.from("email_logs").insert({
        notification_id: payload.notification_id,
        recipient_user_id: payload.admin_user_id,
        recipient_email: profile.email,
        subject: subject,
        notification_type: notificationType,
        status: "failed",
        error_message: emailResult.error,
      });

      return new Response(
        JSON.stringify({ error: emailResult.error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Email sent successfully:", emailResult.id);

    // Log the sent email
    await supabase.from("email_logs").insert({
      notification_id: payload.notification_id,
      recipient_user_id: payload.admin_user_id,
      recipient_email: profile.email,
      subject: subject,
      notification_type: notificationType,
      status: "sent",
    });

    return new Response(
      JSON.stringify({ success: true, email_id: emailResult.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error sending notification email:", error);

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    const tenantId = Deno.env.get('MICROSOFT_TENANT_ID');
    const clientId = Deno.env.get('MICROSOFT_CLIENT_ID');
    const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET');

    if (!tenantId || !clientId || !clientSecret) {
      throw new Error('Microsoft credentials not configured');
    }

    // Get site_id from request body
    let siteId: string | null = null;
    try {
      const body = await req.json();
      siteId = body.site_id || null;
    } catch {
      // No body
    }

    if (!siteId) {
      throw new Error('site_id is required in request body');
    }

    // Get access token
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token error: ${tokenResponse.status} - ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // List drives for the specific site
    const drivesUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives`;
    console.log(`Fetching drives from: ${drivesUrl}`);
    
    const drivesResponse = await fetch(drivesUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!drivesResponse.ok) {
      const errorText = await drivesResponse.text();
      throw new Error(`Graph API error: ${drivesResponse.status} - ${errorText}`);
    }

    const drivesData = await drivesResponse.json();

    return new Response(JSON.stringify({
      success: true,
      site_id: siteId,
      drives: drivesData.value?.map((drive: any) => ({
        id: drive.id,
        name: drive.name,
        driveType: drive.driveType,
        webUrl: drive.webUrl,
        quota: drive.quota,
      })) || [],
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[onedrive-list-site-drives] Error:', errorMessage);
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

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

    // Get access token via client credentials flow
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

    // Parse request body for optional user email
    let userEmail: string | null = null;
    try {
      const body = await req.json();
      userEmail = body.user_email || null;
    } catch {
      // No body provided
    }

    const results: Record<string, unknown> = {};

    // Try to get the user's personal drive
    if (userEmail) {
      try {
        const userDriveUrl = `https://graph.microsoft.com/v1.0/users/${userEmail}/drive`;
        const userDriveResponse = await fetch(userDriveUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        
        if (userDriveResponse.ok) {
          const driveData = await userDriveResponse.json();
          results.user_drive = {
            id: driveData.id,
            name: driveData.name,
            driveType: driveData.driveType,
            owner: driveData.owner,
            webUrl: driveData.webUrl,
          };
        } else {
          const errorText = await userDriveResponse.text();
          results.user_drive_error = `${userDriveResponse.status}: ${errorText}`;
        }
      } catch (e: unknown) {
        results.user_drive_error = e instanceof Error ? e.message : String(e);
      }
    }

    // Try to list all sites (to find SharePoint sites)
    try {
      const sitesUrl = 'https://graph.microsoft.com/v1.0/sites?search=*';
      const sitesResponse = await fetch(sitesUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      
      if (sitesResponse.ok) {
        const sitesData = await sitesResponse.json();
        results.sites = sitesData.value?.map((site: any) => ({
          id: site.id,
          name: site.name,
          displayName: site.displayName,
          webUrl: site.webUrl,
        })) || [];
      } else {
        const errorText = await sitesResponse.text();
        results.sites_error = `${sitesResponse.status}: ${errorText}`;
      }
    } catch (e: unknown) {
      results.sites_error = e instanceof Error ? e.message : String(e);
    }

    // Try root site drives
    try {
      const rootDrivesUrl = 'https://graph.microsoft.com/v1.0/sites/root/drives';
      const rootDrivesResponse = await fetch(rootDrivesUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      
      if (rootDrivesResponse.ok) {
        const drivesData = await rootDrivesResponse.json();
        results.root_site_drives = drivesData.value?.map((drive: any) => ({
          id: drive.id,
          name: drive.name,
          driveType: drive.driveType,
          webUrl: drive.webUrl,
        })) || [];
      } else {
        const errorText = await rootDrivesResponse.text();
        results.root_site_drives_error = `${rootDrivesResponse.status}: ${errorText}`;
      }
    } catch (e: unknown) {
      results.root_site_drives_error = e instanceof Error ? e.message : String(e);
    }

    return new Response(JSON.stringify({
      success: true,
      tenant_id: tenantId,
      client_id: clientId,
      instructions: "Use the 'id' field from user_drive or root_site_drives as your DRIVE_ID",
      results,
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[onedrive-get-drive-id] Error:', errorMessage);
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

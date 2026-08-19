import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  getStrictCorsHeaders,
  handleCorsPrelight,
  sanitizeForLog,
} from '../_shared/security-helpers.ts';
import { validateManageUsers, parseAndValidate } from '../_shared/zod-schemas.ts';

/**
 * MANAGE USERS
 * 
 * Admin-only endpoint for user management (create, update, delete, reset-password).
 * Requires authenticated admin user.
 * 
 * SECURITY: Uses strict CORS + Zod validation + admin role check
 */

Deno.serve(async (req) => {
  // CORS: This is an internal API - use strict CORS
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  const corsHeaders = getStrictCorsHeaders(req);

  try {
    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's JWT to check permissions
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user is authenticated and is admin
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin using admin client
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: roleData, error: roleError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !roleData) {
      return new Response(
        JSON.stringify({ error: 'Acesso negado. Apenas administradores podem gerenciar usuários.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate and parse request body
    const parseResult = await parseAndValidate(req, validateManageUsers);
    
    if (!parseResult.success) {
      console.warn('[manage-users] Validation failed:', parseResult.error);
      return new Response(
        JSON.stringify({ error: parseResult.error }),
        { status: parseResult.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = parseResult.data;
    const { action, userId, userData } = body;

    console.log(`Admin ${user.email} performing action: ${action}`, sanitizeForLog({ userId, userData }));

    switch (action) {
      case 'create': {
        if (!userData?.email || !userData?.password) {
          return new Response(
            JSON.stringify({ error: 'Email e senha são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create user with admin client
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
          email: userData.email,
          password: userData.password,
          email_confirm: true,
        });

        if (createError) {
          console.error('Error creating user:', createError);
          return new Response(
            JSON.stringify({ error: createError.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Update profile with additional info
        const { error: profileError } = await adminClient
          .from('profiles')
          .update({
            nome: userData.nome,
            cargo: userData.cargo,
            is_active: true,
          })
          .eq('user_id', newUser.user.id);

        if (profileError) {
          console.error('Error updating profile:', profileError);
        }

        // Add role
        const { error: roleInsertError } = await adminClient
          .from('user_roles')
          .insert({
            user_id: newUser.user.id,
            role: userData.role || 'funcionario',
          });

        if (roleInsertError) {
          console.error('Error inserting role:', roleInsertError);
        }

        return new Response(
          JSON.stringify({ success: true, userId: newUser.user.id }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update': {
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'userId é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Update profile
        const { error: updateError } = await adminClient
          .from('profiles')
          .update({
            nome: userData?.nome,
            cargo: userData?.cargo,
            is_active: userData?.is_active,
          })
          .eq('user_id', userId);

        if (updateError) {
          console.error('Error updating profile:', updateError);
          return new Response(
            JSON.stringify({ error: updateError.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Update role if provided
        if (userData?.role) {
          // Delete existing role
          await adminClient
            .from('user_roles')
            .delete()
            .eq('user_id', userId);

          // Insert new role
          const { error: roleUpdateError } = await adminClient
            .from('user_roles')
            .insert({
              user_id: userId,
              role: userData.role,
            });

          if (roleUpdateError) {
            console.error('Error updating role:', roleUpdateError);
          }
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'delete': {
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'userId é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Prevent self-deletion
        if (userId === user.id) {
          return new Response(
            JSON.stringify({ error: 'Você não pode excluir sua própria conta' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Delete user (cascade will handle profiles and roles)
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);

        if (deleteError) {
          console.error('Error deleting user:', deleteError);
          return new Response(
            JSON.stringify({ error: deleteError.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Ação inválida' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...getStrictCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
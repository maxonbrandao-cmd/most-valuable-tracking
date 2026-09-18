import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')

    if (!authHeader) {
      throw new Error('Token de autenticação não informado.')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabaseUser = createClient(
      supabaseUrl,
      anonKey,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      },
    )

    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    )

    const {
      data: { user: currentUser },
      error: userError,
    } = await supabaseUser.auth.getUser()

    if (userError || !currentUser) {
      throw new Error('Usuário não autenticado.')
    }

    const body = await req.json()

    const {
      email,
      password,
      fullName,
      phone,
      role,
      clientId,
      driverId,
    } = body

    if (!email || !password || !fullName || !role) {
      throw new Error('Preencha nome, e-mail, senha e tipo de usuário.')
    }

    if (!['cliente', 'piloto'].includes(role)) {
      throw new Error('Tipo de usuário inválido.')
    }

    if (role === 'cliente' && !clientId) {
      throw new Error('Selecione o cliente que será vinculado ao usuário.')
    }

    if (role === 'piloto' && !driverId) {
      throw new Error('Selecione o piloto que será vinculado ao usuário.')
    }

    const { data: createdUser, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })

    if (createError || !createdUser.user) {
      throw new Error(
        createError?.message || 'Não foi possível criar o usuário.',
      )
    }

    const { error: profileError } = await supabaseUser.rpc(
      'add_company_profile',
      {
        p_user_id: createdUser.user.id,
        p_full_name: fullName,
        p_role: role,
        p_client_id: role === 'cliente' ? clientId : null,
        p_driver_id: role === 'piloto' ? driverId : null,
        p_phone: phone || null,
      },
    )

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(createdUser.user.id)

      throw new Error(profileError.message)
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId: createdUser.user.id,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: 200,
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erro inesperado.',
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: 400,
      },
    )
  }
})
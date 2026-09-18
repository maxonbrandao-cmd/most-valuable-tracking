import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    })
  }

  try {
    const authHeader = req.headers.get('Authorization')

    if (!authHeader) {
      throw new Error('Usuário não autenticado.')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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
      error: currentUserError,
    } = await supabaseUser.auth.getUser()

    if (currentUserError || !currentUser) {
      throw new Error('Usuário não autenticado.')
    }

    const { data: ownerProfile, error: ownerError } =
      await supabaseUser
        .from('profiles')
        .select('company_id, role, active')
        .eq('user_id', currentUser.id)
        .single()

    if (ownerError || !ownerProfile) {
      throw new Error('Perfil do administrador não encontrado.')
    }

    if (
      ownerProfile.role !== 'dono' ||
      !ownerProfile.active
    ) {
      throw new Error(
        'Somente o proprietário pode redefinir senhas.',
      )
    }

    const body = await req.json()

    const {
      userId,
      password,
    } = body

    if (!userId || !password) {
      throw new Error(
        'Usuário e nova senha são obrigatórios.',
      )
    }

    const passwordOk =
      password.length >= 8 &&
      /[a-z]/.test(password) &&
      /[A-Z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[^A-Za-z0-9]/.test(password)

    if (!passwordOk) {
      throw new Error(
        'A senha deve ter 8 caracteres e incluir maiúscula, minúscula, número e símbolo.',
      )
    }

    const { data: targetProfile, error: targetError } =
      await supabaseAdmin
        .from('profiles')
        .select('user_id, company_id')
        .eq('user_id', userId)
        .eq('company_id', ownerProfile.company_id)
        .maybeSingle()

    if (targetError) {
      throw targetError
    }

    if (!targetProfile) {
      throw new Error(
        'Usuário não encontrado nesta empresa.',
      )
    }

    const { error: passwordError } =
      await supabaseAdmin.auth.admin.updateUserById(
        userId,
        {
          password,
        },
      )

    if (passwordError) {
      throw passwordError
    }

    return new Response(
      JSON.stringify({
        success: true,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro inesperado.',
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    )
  }
})
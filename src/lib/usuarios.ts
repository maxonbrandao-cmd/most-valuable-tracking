import { supabase } from './supabase'

export type UserRole = 'cliente' | 'piloto'

export type CreateCompanyUserInput = {
  email: string
  password: string
  fullName: string
  phone?: string
  role: UserRole
  clientId?: string
  driverId?: string
}

export async function createCompanyUser(input: CreateCompanyUserInput) {
  const { data, error } = await supabase.functions.invoke(
    'create-company-user',
    {
      body: input,
    },
  )

  if (error) {
    let message = error.message

    try {
      const response = (error as { context?: Response }).context

      if (response) {
        const body = await response.clone().json()

        if (body?.error) {
          message = body.error
        }
      }
    } catch {
      // mantém a mensagem original
    }

    throw new Error(message)
  }

  if (!data?.success) {
    throw new Error(
      data?.error ||
        'Não foi possível criar o usuário.',
    )
  }

  return data
}

export async function resetCompanyUserPassword(
  userId: string,
  password: string,
) {
  const { data, error } =
    await supabase.functions.invoke(
      'reset-company-user-password',
      {
        body: {
          userId,
          password,
        },
      },
    )

  if (error) {
    let message = error.message

    try {
      const response =
        (error as { context?: Response }).context

      if (response) {
        const body =
          await response.clone().json()

        if (body?.error) {
          message = body.error
        }
      }
    } catch {
      // mantém a mensagem original
    }

    throw new Error(message)
  }

  if (!data?.success) {
    throw new Error(
      data?.error ||
        'Não foi possível redefinir a senha.',
    )
  }

  return data
}
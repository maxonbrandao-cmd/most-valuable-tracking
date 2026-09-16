export type CepAddress = {
  cep: string
  logradouro: string
  complemento: string
  bairro: string
  localidade: string
  uf: string
}

type ViaCepResponse = Partial<CepAddress> & { erro?: boolean | 'true' }

export function onlyCepDigits(value: string) {
  return value.replace(/\D/g, '').slice(0, 8)
}

export function formatCep(value: string) {
  const digits = onlyCepDigits(value)
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
}

export function addressFromCep(result: CepAddress) {
  return [result.logradouro, result.bairro, `${result.localidade}/${result.uf}`]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ')
}

export async function lookupCep(value: string): Promise<CepAddress> {
  const cep = onlyCepDigits(value)
  if (cep.length !== 8) throw new Error('Digite um CEP com 8 números.')

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error('Não foi possível consultar o CEP.')

    const data = (await response.json()) as ViaCepResponse
    if (data.erro === true || data.erro === 'true') throw new Error('CEP não encontrado.')

    return {
      cep: formatCep(data.cep ?? cep),
      logradouro: data.logradouro ?? '',
      complemento: data.complemento ?? '',
      bairro: data.bairro ?? '',
      localidade: data.localidade ?? '',
      uf: data.uf ?? '',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('A consulta do CEP demorou demais. Tente novamente.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

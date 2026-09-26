import { describe, it, expect, vi, beforeEach } from 'vitest'
import { registerUser } from '@/services/authService'
import type { RegisterPayload } from '@/types/client'

describe('authService.ts', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  const mockPayload: RegisterPayload = {
    email: 'test@example.com',
    firstName: 'Juan',
    lastName: 'Perez',
    phone: '1234567890',
    gender: 'M',
    birthDate: '1990-01-01',
    language: 'es',
    password: 'Password123!',
    acceptTerms: true,
  }

  it('envía los datos correctamente por POST cuando el backend responde ok', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 200 })
    )

    await expect(registerUser(mockPayload)).resolves.toBeUndefined()

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/auth/register'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockPayload),
      })
    )
  })

  it('une la lista de errores si el backend responde con un arreglo en message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: ['Correo inválido', 'Contraseña muy corta'] }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    )

    await expect(registerUser(mockPayload)).rejects.toThrow(
      'Correo inválido. Contraseña muy corta'
    )
  })

  it('lanza el error con el string recibido si message es un texto simple', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: 'El correo ya está en uso' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    )

    await expect(registerUser(mockPayload)).rejects.toThrow('El correo ya está en uso')
  })

  it('lanza mensaje por defecto si la respuesta no contiene JSON válido o message viene vacío', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Error interno del servidor HTML', { status: 500 })
    )

    await expect(registerUser(mockPayload)).rejects.toThrow('No se pudo crear la cuenta')
  })
})
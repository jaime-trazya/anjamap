/** Reduce las fotos antes de guardarlas; las copias incluyen las imágenes, sin depender de enlaces. */
export function photoSize(width: number, height: number, limit = 1600) {
  const scale = Math.min(1, limit / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export async function preparePhoto(file: File): Promise<string> {
  if (file.size > 20 * 1024 * 1024) throw new Error('La foto supera los 20 MB. Elige una imagen más pequeña.')
  if (file.type === 'image/svg+xml' || (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name))) throw new Error('El archivo no es una foto compatible')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode().catch(() => { throw new Error('No se puede abrir esta foto. Prueba con una imagen JPG, PNG o WebP.') })
    const size = photoSize(image.naturalWidth, image.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Este navegador no puede preparar la foto')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, size.width, size.height)
    ctx.drawImage(image, 0, 0, size.width, size.height)
    const data = canvas.toDataURL('image/jpeg', 0.82)
    if (!data.startsWith('data:image/jpeg;base64,') || data.length > 5_000_000) throw new Error('No se ha podido reducir la foto')
    return data
  } finally {
    URL.revokeObjectURL(url)
  }
}

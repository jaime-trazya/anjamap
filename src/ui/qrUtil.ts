export const puedeEscanear = () => typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia

/** Ruta interna de Anjamap a partir de un enlace leído en un QR (solo enlaces de sitios compartidos) */
export function rutaDeQr(valor: string): string | null {
  const i = valor.indexOf('#/compartido?')
  return i >= 0 ? valor.slice(i + 1) : null
}

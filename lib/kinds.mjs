// Tipos de conteúdo: vídeo (todas as redes) e fotos (imagem única ou carrossel: Meta + LinkedIn manual).
export const KINDS = ['video', 'image', 'carousel'];
export const PHOTO_CHANNELS = ['instagram', 'facebook', 'linkedin'];
const LIMITS = { image: [1, 1], carousel: [2, 10] };
export const isPhoto = kind => kind === 'image' || kind === 'carousel';

// count = null quando a quantidade não está em jogo (edição de um conteúdo já salvo).
export function kindError(kind, channels, count) {
  if (!KINDS.includes(kind)) return 'Tipo de conteúdo inválido.';
  if (!isPhoto(kind)) return '';
  if (channels.some(n => !PHOTO_CHANNELS.includes(n))) return 'Fotos só podem ser publicadas no Instagram, no Facebook e no LinkedIn.';
  if (count !== null) { const [min, max] = LIMITS[kind]; if (count < min || count > max) return kind === 'image' ? 'Envie 1 foto.' : 'O carrossel precisa de 2 a 10 fotos.'; }
  return '';
}

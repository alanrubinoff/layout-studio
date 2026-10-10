// Video vertical animado de un post (1080×1920). Lo usa el video.jsx de cada post:
//   <VideoPost fondo=… titulo={[…]} subtitulo={[…]} cabecera={…} sello={…} reloj={…} colores={…} />
// Todas las piezas son opcionales salvo fondo y título. Las imágenes se pasan con staticFile(),
// con rutas relativas a la carpeta del cliente (p. ej. staticFile('marca/logo.png')).
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { loadFont } from '@remotion/fonts';

// Carga las fuentes una sola vez (Remotion espera a que terminen antes de dibujar cada cuadro).
const cargadas = new Set();
export function cargarFuentes({ titulo, texto }) {
  for (const [family, url, weight] of [['Titulo', titulo, '900'], ['Texto', texto ?? titulo, '500']]) {
    if (url && !cargadas.has(family)) { cargadas.add(family); loadFont({ family, url, weight }); }
  }
}

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
const suave = Easing.out(Easing.cubic);

// Cabecera: logo + usuario + menú, baja desde arriba.
const Cabecera = ({ p, logo, usuario, color }) => (
  <div style={{ position: 'absolute', left: 41, right: 42, top: 60, height: 90, display: 'flex', alignItems: 'center',
    opacity: p, transform: `translateY(${(1 - p) * -40}px)` }}>
    {logo && <Img src={logo} style={{ width: 90, height: 90 }} />}
    {usuario && <span style={{ marginLeft: 22, fontFamily: "'Texto'", fontWeight: 500, fontSize: 34, color,
      transform: 'scaleX(0.66)', transformOrigin: '0 50%', textShadow: '0 1px 8px rgba(0,0,0,.3)' }}>{usuario}</span>}
    <div style={{ marginLeft: 'auto', width: 50, height: 31, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 5, borderRadius: 3, background: color }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, width: '76%', height: 5, borderRadius: 3, background: color }} />
    </div>
  </div>
);

// Sello: anillo de texto curvo (gira lento todo el tiempo) + imagen o estrella al centro.
const Sello = ({ p, giro, texto, imagen, color, x = 780, y = 190, size = 260 }) => (
  <div style={{ position: 'absolute', left: x, top: y, width: size, height: size, color,
    opacity: p, transform: `scale(${0.4 + 0.6 * p}) rotate(${(1 - p) * -90}deg)` }}>
    <svg viewBox="0 0 260 260" style={{ position: 'absolute', inset: 0, overflow: 'visible', transform: `rotate(${giro}deg)` }}>
      <path id="anillo" d="M230,130 A100,100 0 1 1 30,130 A100,100 0 1 1 230,130" fill="none" />
      {[80.56, 13.89, 47.22].map((o) => (
        <text key={o} fontSize="31" letterSpacing="1" textAnchor="middle" fill="currentColor" style={{ fontFamily: "'Texto'", fontWeight: 500 }}>
          <textPath href="#anillo" startOffset={`${o}%`}>{texto}</textPath>
        </text>
      ))}
      {[[240.3, 110.6], [91.7, 235.2], [58, 44.2]].map(([cx, cy]) => <circle key={cx} cx={cx} cy={cy} r="4.5" fill="currentColor" />)}
    </svg>
    {imagen
      ? <Img src={imagen} style={{ position: 'absolute', left: '16.54%', top: '21.15%', width: '60%' }} />
      : <svg viewBox="0 0 100 100" style={{ position: 'absolute', left: '30%', top: '30%', width: '40%' }}>
          <path d="M50,5 L61,38 L96,38 L68,59 L78,93 L50,72 L22,93 L32,59 L4,38 L39,38 Z" fill="currentColor" />
        </svg>}
  </div>
);

// Reloj: aparece con rebote; los minutos cuentan hasta el valor indicado.
const Reloj = ({ p, imagen, minutos, color, x = 60, y = 820, ancho = 300 }) => {
  const k = ancho / 266; // posiciones medidas sobre un reloj de 266 px de ancho
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: ancho, opacity: Math.min(1, p * 1.5),
      transform: `scale(${p})`, transformOrigin: '50% 60%' }}>
      <Img src={imagen} style={{ width: '100%', display: 'block' }} />
      {minutos != null && <div style={{ position: 'absolute', left: 83 * k, top: 123 * k, fontFamily: "'Texto'", fontWeight: 500,
        fontStyle: 'italic', fontSize: 56 * k, lineHeight: 1, color, transform: 'scaleX(0.82)', transformOrigin: '0 0', whiteSpace: 'nowrap' }}>
        {minutos}’
      </div>}
    </div>
  );
};

export const VideoPost = ({ fondo, titulo, subtitulo = [], cabecera = null, sello = null, reloj = null,
  colores = {}, tituloTamano = 112, tituloEscala = 0.74 }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const c = { texto: '#ffffff', acento: '#f6f09c', reloj: '#fbf583', ...colores };
  const resorte = (desde, config = { damping: 200 }) => spring({ frame: frame - desde, fps, config, durationInFrames: 30 });

  // Fondo: zoom lento (efecto Ken Burns) durante todo el video.
  const zoom = interpolate(frame, [0, durationInFrames], [1.08, 1.18]);
  // Orden de entrada: cabecera → subtítulo → título (línea por línea) → sello → reloj.
  const pCabecera = interpolate(frame, [0, 18], [0, 1], { ...clamp, easing: suave });
  const pSub = interpolate(frame, [10, 30], [0, 1], { ...clamp, easing: suave });
  const linea = (i) => resorte(22 + i * 7);
  const pSello = resorte(48, { damping: 14, mass: 0.8 });
  const pReloj = resorte(60, { damping: 10, mass: 0.6 });
  const minutos = reloj?.minutos != null ? Math.round(interpolate(frame, [62, 95], [0, reloj.minutos], { ...clamp, easing: suave })) : null;
  // Últimos 10 cuadros: fundido a negro para cerrar.
  const salida = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', opacity: salida }}>
      <Img src={fondo} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` }} />
      {/* degradé para que el texto se lea sobre la foto */}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.15) 45%, rgba(0,0,0,0) 70%)' }} />

      {cabecera && <Cabecera p={pCabecera} {...cabecera} color={c.texto} />}

      <div style={{ position: 'absolute', left: 80, top: 300 }}>
        {subtitulo.length > 0 && (
          <div style={{ fontFamily: "'Texto'", fontWeight: 500, color: c.acento, fontSize: 44, lineHeight: 1.25,
            whiteSpace: 'nowrap', opacity: pSub, transform: `translateY(${(1 - pSub) * 20}px)`, marginBottom: 36,
            textShadow: '0 2px 12px rgba(0,0,0,.4)' }}>
            {subtitulo.map((l) => <div key={l}>{l}</div>)}
          </div>
        )}
        {titulo.map((texto, i) => {
          const p = linea(i);
          const ultima = i === titulo.length - 1 && titulo.length > 1;
          return (
            // overflow hidden: el texto "sale" de una máscara por debajo de cada línea
            <div key={i} style={{ overflow: 'hidden', paddingBottom: 6 }}>
              <div style={{
                fontFamily: "'Titulo'", fontWeight: 900, textTransform: 'uppercase',
                color: ultima ? c.acento : c.texto, fontSize: tituloTamano, lineHeight: 1.02, whiteSpace: 'nowrap',
                transform: `translateY(${(1 - p) * 110}%) scaleX(${tituloEscala})`, transformOrigin: '0 0', opacity: p,
                textShadow: '0 4px 24px rgba(0,0,0,.35)',
              }}>
                {texto}
              </div>
            </div>
          );
        })}
      </div>

      {sello && <Sello p={pSello} giro={frame * 0.6} {...sello} color={c.acento} />}
      {reloj?.imagen && <Reloj p={pReloj} {...reloj} minutos={minutos} color={c.reloj} />}
    </AbsoluteFill>
  );
};

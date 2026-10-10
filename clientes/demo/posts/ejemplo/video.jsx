// Video de demo/ejemplo: vertical 1080×1920 a 30 fps.
// Generado desde post.html con `npm run nuevo-video`; editalo libremente (textos, piezas, duración).
// Ver:      npm run video -- demo/ejemplo
// Exportar: npm run video:render -- demo/ejemplo   → export/ejemplo.mp4
// staticFile() lee archivos de clientes/demo/ (la carpeta del cliente).
import { staticFile } from 'remotion';
import { VideoPost, cargarFuentes } from '../../../../video/VideoPost.jsx';

export const duracion = 5; // segundos

cargarFuentes({ titulo: staticFile("marca/fonts/archivo-black.ttf"), texto: staticFile("marca/fonts/archivo.ttf") });

export default function Video() {
  return (
    <VideoPost
      fondo={staticFile("posts/ejemplo/fondo.png")}
      titulo={["Pan","de masa","madre"]}
      subtitulo={["Recién salido del horno","todos los días"]}
      cabecera={{ logo: staticFile("marca/logo.png"), usuario: "tumarca" }}
      sello={{ texto: "NUEVO", imagen: null }}
      colores={{"texto":"#fff6e6","acento":"#ffd27a"}}
    />
  );
}

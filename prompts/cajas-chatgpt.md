# Prompt: imagen de cajas (ChatGPT)

Se usa en chatgpt.com adjuntando `referencia.png` del post. El resultado se guarda como `cajas.png` en la carpeta del post y se procesa con `npm run boxes -- <cliente>/<post>`.

---

Quiero que generes una **versión anotada de esta misma imagen**, agregando bounding boxes (rectángulos de colores) alrededor de todos los elementos gráficos superpuestos sobre la fotografía.

**Objetivo:** utilizar posteriormente un algoritmo de detección de colores para extraer automáticamente las coordenadas de cada elemento y reconstruir el diseño en HTML/CSS.

### Instrucciones

1. Conservá la imagen original con la máxima fidelidad posible: misma resolución, proporciones, composición, textos y posiciones.
2. Identificá todos los elementos gráficos agregados al diseño:
   - Títulos y subtítulos.
   - Logos y nombres de usuario.
   - Iconos, sellos y elementos decorativos.
   - Cronómetros, etiquetas y gráficos.
   - Imágenes de productos superpuestas, si corresponde.
3. Dibujá un **rectángulo de un color sólido diferente alrededor de cada elemento**.
4. Cada rectángulo debe ajustarse lo máximo posible a los límites visibles del elemento, sin márgenes innecesarios.
5. Usá colores muy saturados y claramente distinguibles: verde neón, magenta, cian, rojo, azul, naranja, etc.
6. Las líneas deben ser finas, continuas, de color uniforme, sin transparencia, sombras ni efectos.
7. Separá los elementos independientes. Por ejemplo, un logo y un nombre de usuario deben tener rectángulos distintos.
8. **No dibujes rectángulos sobre elementos que formen parte de la fotografía original**, como platos, alimentos, utensilios, muebles o fondos.
9. No agregues números, etiquetas, leyendas ni texto explicativo.
10. No cambies, elimines ni rediseñes ningún elemento existente.

### Reglas importantes

- La imagen final debe ser visualmente idéntica a la original, excepto por los bounding boxes.
- Los rectángulos deben estar alineados horizontal y verticalmente.
- Evitá superponer rectángulos cuando los elementos puedan delimitarse por separado.
- Conservá exactamente las dimensiones y la relación de aspecto originales.
- Generá **una única imagen final** con todas las anotaciones.

**Importante:** no quiero una interpretación artística ni una recreación del diseño. Quiero una anotación visual de la imagen proporcionada que permita recuperar las coordenadas de los elementos mediante procesamiento de píxeles.

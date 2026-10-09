# Prompt: fondo limpio por borrado (ChatGPT)

Se usa en chatgpt.com adjuntando `referencia.png` del post. El resultado se guarda como `fondo.png`.

**Por qué así:** si el fondo se *regenera*, la foto entera cambia un poco (lo medimos en posts reales: el fondo regenerado difería de la referencia en todo el cuadro, incluso lejos de los textos). Si en cambio se *borran* sólo los elementos superpuestos sobre la misma imagen, todo lo demás queda igual a la referencia y:

- el diseño final coincide con la foto que se aprobó (el paquete, la persona y los objetos no se corren);
- comparar `referencia.png` con `fondo.png` marca exactamente dónde estaba cada texto, logo o ícono, sin necesitar la imagen de cajas.

---

Necesito que **edites esta misma imagen** para quitar todos los elementos gráficos superpuestos sobre la fotografía, y que reconstruyas la foto debajo de ellos.

### Quitar

- Títulos, subtítulos y cualquier otro texto agregado.
- Logo y nombre de usuario de la cabecera, y el ícono de menú.
- Sellos, íconos, cronómetros, subrayados, flechas y demás decoraciones agregadas.

### Conservar sin cambios

- Todo lo que forma parte de la fotografía: personas, comida, platos, utensilios, envases de producto (incluido el paquete con su etiqueta), muebles, fondo e iluminación.
- La resolución, el encuadre, las proporciones y la posición de cada objeto. **No regeneres ni redibujes la escena**: fuera de las zonas donde había un elemento gráfico, cada píxel debe quedar igual al original.

### Cómo rellenar

- Reconstruí sólo el área que ocupaba cada elemento quitado, continuando de forma natural lo que hay alrededor (texturas, desenfoque, luces y sombras).
- No agregues objetos, textos, marcas de agua ni elementos nuevos.

Generá **una única imagen final**, con las mismas dimensiones que la original.

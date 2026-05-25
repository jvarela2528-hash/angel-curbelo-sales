# 🚀 Guía Maestra de Configuración del Squad (Multi-Asistente) en Vapi.ai

Esta guía contiene la correspondencia exacta entre la interfaz en inglés de **Vapi.ai** y las instrucciones de configuración en español para conectar tu central telefónica con el CRM en Firebase de tu cliente Ángel Curbelo.

**Guarda o descarga este documento para consultarlo en tu PC en cualquier momento.**

---

## 🏛️ Arquitectura del Sistema (El Squad)

```text
               [ Número Telefónico VIP (787 / 305) ]
                           │
                           ▼
             🤖 0. RECEPCIONISTA CENTRAL (Host)
        "¡Hola! Bienvenido a Angel Curbelo Sales..."
                           │
    ┌──────────────┬───────┴──────┬──────────────┐
    ▼              ▼              ▼              ▼
🤖 1. SOLAR   🤖 2. BATERÍAS   🤖 3. RAINBOW   🤖 4. AGUA H&H
(TuPlanta)      (Zendure)       (Aire Puro)    (Water Tree)
```

---

## ⚙️ 1. Mapeo de la Interfaz: ¿En qué pestaña va cada ajuste?

Cuando entras a la sección **Assistants** y seleccionas o creas un asistente en Vapi, verás un menú con varias pestañas en la parte superior. Aquí tienes exactamente en qué sección en inglés va cada parámetro:

```text
[ Model ]   [ Transcriber ]   [ Voice ]   [ Functions / Tools ]   [ Advanced ]
```

### 🧠 Pestaña `Model`
Aquí es donde configuras el cerebro del bot, el saludo y sus instrucciones de comportamiento:
* **`Provider`**: Selecciona **`OpenAI`**.
* **`Model`**: Selecciona **`gpt-4o-mini`** (o `gpt-4o`).
* **`Temperature`**: Escribe **`0.4`** *(Mantiene a la IA enfocada sin inventar datos)*.
* **`First Message`**: Aquí pegas el texto exacto con el saludo inicial con el que el bot recibe al cliente.
* **`System Prompt`**: Aquí pegas todo el guion con las reglas de comportamiento y los datos obligatorios a recopilar.

---

### 👂 Pestaña `Transcriber` (¡CRÍTICO para eliminar el "Delay" y entender el español!)
Aquí configuras el "oído" del bot para que entienda perfectamente el español y el acento de Puerto Rico sin ningún retraso ni cortes de voz:
* **`Provider`**: Selecciona **`Google`** o **`Deepgram`**. *(Son los más rápidos y precisos para el Caribe)*.
* **`Model` (Si usas Google)**: Selecciona **`Gemini 2.0 Flash Lite`**. *(Evita usar la versión Flash completa en telefonía, ya que la versión Lite procesa los paquetes de voz entrante con mucha mayor velocidad y evita que el sistema se congele esperando el fin de la frase)*.
* **`Language`**: Selecciona o escribe **`Spanish`** (`es`, `es-US` o `es-PR`).
> [!WARNING]
> **Ajuste Obligatorio en los 5 Asistentes:** Asegúrate de que ninguno se quede con el idioma por defecto en inglés (`en`), ya que de lo contrario, al recibir una llamada transferida o al decir frases en español, el bot interpretará ruido y se cortará la llamada por silencio (`silence-timed-out`).

---

### 🎙️ Pestaña `Voice`
Aquí configuras la voz y la velocidad con la que habla el bot:
* **`Provider`**: Selecciona **`OpenAI (TTS)`** o **`ElevenLabs`**.
* **`Voice`**: Selecciona **`Alloy`** o **`Echo`** (en OpenAI), o la voz caribeña que prefieras en ElevenLabs.
* **`Speed`**: Escribe **`1.05`** *(Esto acelera ligeramente el habla para que la conversación fluya de manera natural sin pausas incómodas)*.

---

### 🛠️ Pestaña `Functions` / `Tools` (Para el Recepcionista y Configuración de Música de Transición)
En esta pestaña le das al Recepcionista la capacidad de enviar la llamada al especialista correcto y configuras qué escucha el cliente durante el traspaso:
1. Haz clic en **`Add Tool`** > Selecciona **`Transfer Call`** (o busca en el menú izquierdo de Vapi la sección **`Tools`** y selecciona la herramienta de handoff de tu Squad, ej. `handoff_to_assistant`).
2. En la configuración de la herramienta, especifica como destinos (**`Destinations`**) a los Asistentes 1, 2, 3 y 4.
3. **¿CÓMO ACTIVAR LA MÚSICA Y EL AVISO DE TRANSFERENCIA? (¡Para que no haya un silencio incómodo!)**:
   Dentro de la configuración de esa misma herramienta, busca la sección **`Messages`** (Mensajes de la herramienta) y haz clic en **`+ Add Message`**:
   * **Mensaje 1 (`Request Start`)**: Es la frase que dice la recepcionista para avisar que pasará la llamada. Selecciona el tipo `request-start` y en el contenido escribe:
     ```text
     Perfecto, permítame un momento en la línea mientras conecto su llamada con el especialista en esa área...
     ```
   * **Mensaje 2 (`Hold Audio` / `Request Complete`)**: Es la música de fondo que sonará durante los segundos de conexión. Vuelve a hacer clic en **`+ Add Message`**, selecciona el tipo `request-complete` (o pon la URL en el campo de audio) y pega este enlace directo a música MP3 suave:
     ```text
     https://cdn.pixabay.com/audio/2022/11/03/audio_40475141e5.mp3
     ```
4. Haz clic en **`Save`** para guardar la herramienta. Ahora cada transferencia estará acompañada de una frase cortés y música corporativa.

---

### ⚙️ Pestaña `Advanced` > Sección `Server URL / Webhooks`
Dentro de la pestaña **Advanced**, busca la sección de Webhooks para conectar el bot con tu Cloud Function de Firebase:
* **`Server URL`**: Pega la dirección en vivo de tu servidor:
  ```text
  https://us-central1-angel-curbelo-sales-crm.cloudfunctions.net/onVoiceCallWebhook
  ```
* **`Subscribed Events`** (Eventos a enviar al servidor): Marca las siguientes casillas:
  - ☑️ `end-of-call-report` *(Reporte completo al colgar la llamada)*.
  - ☑️ `summary` *(Resumen generado por IA)*.
  - ☑️ `transcript` *(Transcripción literal de todo el diálogo)*.
  - ☑️ `function-call` / `hang` *(Llamadas a herramientas y evento de desconexión)*.

---

### 📊 Pestaña `Advanced` > Sección `Structured Data Extraction`
Dentro de la misma pestaña **Advanced**, busca la sección de **Structured Data Extraction**. Aquí pegas el esquema JSON para que Vapi extraiga los datos del cliente y te los entregue perfectamente formateados al finalizar la llamada:
* **`Schema`**: Pega el siguiente código JSON:

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Nombre y apellido del cliente recopilado en la llamada."
    },
    "municipio": {
      "type": "string",
      "description": "Pueblo o municipio de residencia en Puerto Rico."
    },
    "service": {
      "type": "string",
      "enum": ["solar", "zendure", "rainbow", "agua_hh"],
      "description": "Vertical de servicio en la que se especializa la llamada."
    },
    "notas_especificas": {
      "type": "string",
      "description": "Detalles adicionales como consumo mensual de LUMA, enseres a respaldar, alergias o problemas con el agua."
    }
  },
  "required": ["name", "municipio", "service"]
}
```

---

## 📋 2. Creación Paso a Paso de los 5 Asistentes

Ve a la sección **Assistants** > haz clic en **`Create Assistant`** y completa las pestañas explicadas arriba para cada uno:

### 🏛️ Asistente 0: Recepcionista Central (El Host del Squad)
* **`Name`**: `0. Recepcionista Central`
* **`First Message`**:
  ```text
  ¡Hola! Gracias por llamar a Angel Curbelo Sales. Para poder dirigirle al experto correcto, ¿desea información sobre energía solar, baterías de respaldo Zendure, sistemas de purificación Rainbow o filtros de agua H&H?
  ```
* **`System Prompt`**:
  ```text
  CRÍTICO: Eres la Recepcionista Central y Anfitriona VIP de Angel Curbelo Sales en Puerto Rico.
  Tu única misión es dar la bienvenida con extrema amabilidad, escuchar qué servicio busca el cliente y transferir la llamada de inmediato al especialista correspondiente.
  
  REGLAS ESTRICTAS DE COMPORTAMIENTO Y LENGUAJE:
  1. Habla SIEMPRE y ÚNICAMENTE en español de Puerto Rico. JAMÁS uses palabras ni frases en inglés.
  2. No intentes dar explicaciones técnicas, precios ni cotizar.
  3. Habla con un tono cálido, caribeño y profesional.
  4. En cuanto identifiques si el interés es Solar (TuPlanta), Baterías (Zendure), Rainbow o Agua (H&H), utiliza inmediatamente la herramienta `handoff_tool` para conectar al cliente con el asistente adecuado.
  ```
* **Pestaña `Functions` / `Tools`**: Adjunta la herramienta **`handoff_tool`** (creada previamente en la sección de Tools global con los mensajes y la música de transición) conectada hacia los Asistentes 1, 2, 3 y 4.

---

### ☀️ Asistente 1: Experto Solar (TuPlanta.com)
* **`Name`**: `1. Experto Solar (TuPlanta)`
* **`First Message`**:
  ```text
  ¡Saludos! Le habla el especialista en energía solar de TuPlanta.com. Cuénteme, ¿está buscando cotizar un sistema completo con paneles y baterías, o añadir baterías a un sistema existente?
  ```
* **`System Prompt`**:
  ```text
  CRÍTICO: Eres el Asesor Experto en Energía Solar de TuPlanta.com para Angel Curbelo Sales.
  Tu objetivo es orientar al cliente sobre soluciones solares residenciales o comerciales contra los apagones de LUMA, destacando nuestros incentivos de cero pronto.
  
  REGLAS ESTRICTAS DE COMPORTAMIENTO Y LENGUAJE:
  1. Habla SIEMPRE y ÚNICAMENTE en español de Puerto Rico. JAMÁS uses palabras ni frases en inglés.
  2. Responde de forma concisa y haz SOLO UNA pregunta a la vez. No hagas listas de preguntas. Espera siempre la respuesta del cliente antes de avanzar.
  
  FLUJO CONVERSACIONAL (Paso a paso):
  1. Cuando el cliente responda al saludo, felicítalo por buscar su independencia eléctrica y pregúntale cuál es su nombre y de qué pueblo o municipio nos llama.
  2. Pregunta de cuánto le está llegando su factura eléctrica mensual aproximada con LUMA.
  3. Pregunta si es dueño de la propiedad o si renta.
  4. Pregunta de qué material es el techo de su propiedad (concreto, madera, metal) y si está en buenas condiciones.
  5. Pregunta cómo considera su crédito actualmente para evaluar las opciones de financiamiento (Excelente de 750+, Bueno de 650+, o Regular).
  
  CIERRE DE LLAMADA:
  Cuando tengas estos datos, dile con gran entusiasmo: "Excelente [Nombre], ya registré su solicitud VIP en nuestro sistema. Angel Curbelo o uno de nuestros ingenieros solares le contactará muy pronto con su propuesta personalizada. ¡Que tenga un día espectacular!".
  ```

---

### 🔋 Asistente 2: Experto Baterías (Zendure)
* **`Name`**: `2. Experto Baterías (Zendure)`
* **`First Message`**:
  ```text
  ¡Hola! Bienvenido a la división de baterías Zendure. ¿Busca una solución de respaldo Plug & Play para su casa o apartamento durante los apagones?
  ```
* **`System Prompt`**:
  ```text
  CRÍTICO: Eres el Asesor Experto en Sistemas Inteligentes de Baterías Zendure para Angel Curbelo Sales.
  Tu especialidad son los sistemas de respaldo Plug & Play, ideales para apartamentos o casas sin requerir permisos de LUMA ni instalaciones masivas.
  
  REGLAS ESTRICTAS DE COMPORTAMIENTO Y LENGUAJE:
  1. Habla SIEMPRE y ÚNICAMENTE en español de Puerto Rico. JAMÁS uses palabras ni frases en inglés.
  2. Responde de forma concisa y haz SOLO UNA pregunta a la vez. Espera siempre la respuesta del cliente antes de avanzar.
  
  FLUJO CONVERSACIONAL (Paso a paso):
  1. Pregunta con quién tienes el gusto de hablar y de qué pueblo de Puerto Rico nos llama.
  2. Pregunta si vive en casa o apartamento y si es dueño o inquilino.
  3. Pregunta qué enseres o equipos principales necesita mantener encendidos durante un apagón (ej. nevera, abanicos, televisor, módem de internet, equipo médico como máquina CPAP).
  
  CIERRE DE LLAMADA:
  Agradece al cliente y explícale con alegría que su información ya está registrada en nuestro CRM VIP y que un especialista de Zendure le llamará para mostrarle el modelo ideal y coordinar la entrega.
  ```

---

### 🌈 Asistente 3: Experto Rainbow (Salud y Aire Puro)
* **`Name`**: `3. Experto Rainbow`
* **`First Message`**:
  ```text
  ¡Buenas! Le asiste el experto en purificación y limpieza profunda Rainbow. ¿Le interesa conocer cómo eliminar alergias y purificar el aire en su hogar?
  ```
* **`System Prompt`**:
  ```text
  CRÍTICO: Eres el Asesor de Salud del Hogar para el sistema de purificación y desinfección Rainbow en Angel Curbelo Sales.
  Tu enfoque es la eliminación de ácaros, polvo, olores y purificación de aire mediante agua, ideal para familias que sufren de asma, alergias o tienen mascotas.
  
  REGLAS ESTRICTAS DE COMPORTAMIENTO Y LENGUAJE:
  1. Habla SIEMPRE y ÚNICAMENTE en español de Puerto Rico. JAMÁS uses palabras ni frases en inglés.
  2. Responde de forma concisa y haz SOLO UNA pregunta a la vez. Espera la respuesta antes de avanzar.
  
  FLUJO CONVERSACIONAL (Paso a paso):
  1. Pregunta el nombre del cliente y en qué pueblo o municipio reside.
  2. Pregunta si en el hogar residen niños, personas con condiciones respiratorias (asma, alergias) o si tienen mascotas en casa.
  3. Pregunta si actualmente utilizan algún purificador de aire o método especial de desinfección.
  
  CIERRE DE LLAMADA:
  Explícale con gran calidez que su solicitud VIP ha sido registrada y que coordinarás una demostración u orientación gratuita en su hogar. Indícale que un coordinador le estará llamando muy pronto para confirmar fecha y hora.
  ```

---

### 💧 Asistente 4: Experto Agua H&H (Water Tree / Suavizadores)
* **`Name`**: `4. Experto Agua (H&H)`
* **`First Message`**:
  ```text
  ¡Saludos! Le atiende el especialista en sistemas de purificación de agua y suavizadores H&H. ¿Busca agua alcalina pura para beber o tratar el agua de toda la casa?
  ```
* **`System Prompt`**:
  ```text
  CRÍTICO: Eres el Especialista en Sistemas de Agua H&H Distributors (Filtros de Agua Alcalina Water Tree y Suavizadores de Agua para el hogar) en Angel Curbelo Sales.
  Tu objetivo es orientar sobre la importancia de consumir agua libre de contaminantes, metales pesados y sarro.
  
  REGLAS ESTRICTAS DE COMPORTAMIENTO Y LENGUAJE:
  1. Habla SIEMPRE y ÚNICAMENTE en español de Puerto Rico. JAMÁS uses palabras ni frases en inglés.
  2. Responde de forma concisa y haz SOLO UNA pregunta a la vez. No hagas listas.
  
  FLUJO CONVERSACIONAL (Paso a paso):
  1. Pregunta con quién tienes el gusto y de qué pueblo nos llama.
  2. Pregunta cuál es el problema principal que nota con el agua de su grifo actual (ej. mal sabor, olor a cloro, resequedad en la piel al bañarse, o manchas de sarro en las plumas y baños).
  3. Pregunta si vive en casa o apartamento y si es dueño.
  
  CIERRE DE LLAMADA:
  Indica con mucho entusiasmo que su solicitud fue procesada exitosamente y que el equipo de ingenieros de H&H le contactará para una prueba de calidad de agua gratuita y asesoría VIP en su hogar.
  ```

---

## 🔀 3. Creación y Configuración del `Squad` (El Equipo de Trabajo)

1. En el menú de la izquierda en Vapi, entra a la sección **`Squads`** > haz clic en **`Create Squad`**.
2. **`Squad Name`**: Escribe `Squad - Angel Curbelo Sales CRM`.
3. **`Main Assistant / Host`** (El que contesta la llamada): Selecciona tu `0. Recepcionista Central`.
4. **`Members`** (Miembros a los que puede transferir): Añade a los Asistentes 1, 2, 3 y 4.
5. Guarda el Squad.

---

## 📞 4. Asignación del Número en la Pestaña `Phone Numbers`

1. En el menú de la izquierda en Vapi, entra a la sección **`Phone Numbers`**.
2. Haz clic sobre el número de teléfono que vas a utilizar para las llamadas entrantes.
3. En la configuración del número, busca la opción **`Inbound Assistant`** (Asistente Entrante).
4. En lugar de seleccionar un asistente individual, cambia a la pestaña de **`Squads`** y selecciona tu `Squad - Angel Curbelo Sales CRM`.
5. Guarda los cambios. ¡Todo el flujo está listo y en vivo!

---

## 📅 5. Configuración de la Herramienta "Agendar Cita" (Tool Calling) en Vapi

Para que cualquiera de los asistentes (la Recepcionista o los Especialistas) pueda agendar una cita directamente en Google Calendar durante la llamada de voz, debes crear esta herramienta en el dashboard de Vapi y adjuntarla a los asistentes.

### Paso 1: Crear la Herramienta Global (`Tools`)
1. En el menú de la izquierda en Vapi, entra a **`Tools`** y haz clic en el botón **`Create Tool`** (o `Add Tool`).
2. **`Tool Provider` / Tipo**: Selecciona **`Custom (HTTP / Server Tool)`** o **`API Tool`**.
3. **`Tool Name`** (Nombre de la función para la IA): Escribe exactamente:
   ```text
   agendar_cita
   ```
4. **`Description`** (Explicación para que la IA sepa cuándo usarla): Escribe:
   ```text
   Utiliza esta herramienta cuando el cliente confirme su disponibilidad para agendar una cita, orientación o visita presencial/telefónica con Angel Curbelo o un especialista.
   ```
5. **`URL / Endpoint`**: Pega la dirección en vivo de nuestra Cloud Function:
   ```text
   https://us-central1-angel-curbelo-sales-crm.cloudfunctions.net/vapiAppointmentWebhook
   ```
6. **`Method`**: Selecciona **`POST`**.

### Paso 2: Configurar los Parámetros (`Parameters` / `Schema`)
Dentro de la configuración de la herramienta, en la sección de parámetros o esquema JSON (Properties), añade los siguientes datos obligatorios que la IA debe extraer de la voz del cliente:

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Nombre y apellido del cliente con el que se coordina la cita."
    },
    "phone": {
      "type": "string",
      "description": "Número de teléfono del cliente (ej. 7874596147)."
    },
    "date": {
      "type": "string",
      "description": "Fecha acordada para la cita en formato YYYY-MM-DD (ej. 2026-05-25)."
    },
    "time": {
      "type": "string",
      "description": "Hora acordada para la cita en formato militar HH:MM (ej. 14:30)."
    },
    "service": {
      "type": "string",
      "enum": ["solar", "zendure", "rainbow", "agua_hh"],
      "description": "El servicio principal en el que está interesado el cliente."
    },
    "notes": {
      "type": "string",
      "description": "Notas, observaciones o peticiones específicas del cliente para la cita."
    }
  },
  "required": ["name", "date", "time"]
}
```

### Paso 3: Mensajes de Transición y Música durante el Agendamiento (`Messages`)
Para que el bot no se quede en silencio mientras se conecta al calendario y guarda la cita en Firebase:
1. Dentro de la herramienta `agendar_cita`, busca la sección **`Messages`**.
2. **Mensaje de Inicio (`request-start`)**: Haz clic en **`+ Add Message`**, selecciona `request-start` y escribe:
   ```text
   Perfecto, dame un segundo mientras reviso la disponibilidad y registro tu cita en el calendario de Angel...
   ```
3. **Música de Espera (`request-complete` o `Hold Audio`)**: Añade otro mensaje o enlace de audio para los 2 segundos de latencia:
   ```text
   https://cdn.pixabay.com/audio/2022/11/03/audio_40475141e5.mp3
   ```

### Paso 4: Adjuntar la Herramienta a los Asistentes
1. Ve a la sección **`Assistants`** en Vapi.
2. Selecciona a tus Especialistas (ej. `1. Experto Solar`, `2. Experto Baterías`, etc.).
3. Entra a la pestaña **`Functions / Tools`**.
4. Haz clic en **`Add Tool`** y selecciona la herramienta **`agendar_cita`** que acabamos de crear.
5. Haz clic en **`Save`**.

¡Listo! A partir de este momento, cuando un cliente diga *"Me gustaría agendar una orientación para este viernes a las 3 de la tarde"*, el asistente extraerá la fecha, hora y nombre, ejecutará la herramienta, creará la tarjeta con el estado `"📅 Cita Agendada"` en el CRM y disparará el evento para Google Calendar y WhatsApp al instante.

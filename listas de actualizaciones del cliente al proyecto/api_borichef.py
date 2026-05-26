import sys

# Asegurar codificación UTF-8 en stdout/stderr para prevenir errores de UnicodeEncodeError con emojis en Windows
if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
# Aquí importas el motor unificado que estabilizamos en Antigravity
from motor_supermercados import ejecutar_agente_compra_movil


app = FastAPI(title="BoriChef Grocery Agent API")

# Configurar middleware de CORS para permitir peticiones desde el frontend web/móvil
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Estructura de datos que enviará el celular del usuario
class OrdenCompra(BaseModel):
    supermercado: str  # "Pueblo", "SuperMax" o "Walmart"
    receta_texto: str  # La lista de ingredientes formateada
    usuario: str       # Email/Username del cliente
    password: str      # Password del cliente

@app.post("/api/v1/carrito/llenar")
def llenar_carrito_usuario(orden: OrdenCompra):
    print(f"📥 Petición recibida desde BoriChef App para: {orden.supermercado}")
    
    # Validación de comercios certificados en el MVP
    if orden.supermercado.lower() not in ["pueblo", "supermax", "walmart"]:
        raise HTTPException(status_code=400, detail="Supermercado no soportado en esta fase.")
        
    try:
        # Se ejecuta el bot pasándole las credenciales directas del móvil
        exito = ejecutar_agente_compra_movil(
            texto_receta=orden.receta_texto,
            comercio_seleccionado=orden.supermercado,
            usuario_movil=orden.usuario,
            password_movil=orden.password
        )
        
        if exito:
            return {"status": "success", "message": f"¡Carrito de {orden.supermercado} listo!"}
        else:
            return {"status": "failed", "message": "No se pudieron añadir todos los ingredientes."}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en el agente: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api_borichef:app", host="0.0.0.0", port=8000, reload=False)
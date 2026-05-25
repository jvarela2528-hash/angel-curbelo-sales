import requests

# URL local o de staging donde estará corriendo tu API de BoriChef
API_URL = "http://127.0.0.1:8000/api/v1/carrito/llenar"

def simular_boton_comprar_movil():
    print("📱 [BoriChef App] Simulando selección de usuario en el celular...")
    
    # 1. La app extrae los ingredientes de la receta activa
    lista_ingredientes = """
    - 2 Leche Fresh Milk Tres Monjitas 1G
    - 1 Envase de sofrito Chef Pinero con cilantro
    """
    
    # 2. Datos capturados en los inputs nativos de la pantalla móvil
    payload = {
        "supermercado": "SuperMax",  # <-- ¡Coma añadida aquí!
        "receta_texto": lista_ingredientes,
        "usuario": "alexandervarela1@yahoo.com", 
        "password": "Jvarela2528"          
    }
    
    print(f"🚀 Enviando payload de forma segura al servidor...")
    try:
        response = requests.post(API_URL, json=payload, timeout=60)
        if response.status_code == 200:
            print("🎉 Respuesta del Servidor:", response.json())
        else:
            print(f"❌ Error {response.status_code}: {response.text}")
    except Exception as e:
        print(f"❌ No se pudo conectar al API de BoriChef: {e}")

if __name__ == "__main__":
    simular_boton_comprar_movil()
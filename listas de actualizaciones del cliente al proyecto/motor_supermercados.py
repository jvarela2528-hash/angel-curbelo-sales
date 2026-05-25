import os
import sys

# Asegurar que el directorio de Agente está en el PATH para importar mi_bot_compras
agente_dir = r"C:\Proyectos\Agente"
if agente_dir not in sys.path:
    sys.path.append(agente_dir)

try:
    from mi_bot_compras import enrutar_flujo_compras, procesar_texto_lista, ejecutar_compras_supermercado
except ImportError as e:
    print(f"❌ Error al importar mi_bot_compras: {e}")
    raise

def ejecutar_agente_compra_movil(texto_receta, comercio_seleccionado, usuario_movil, password_movil):
    print(f"🤖 [Motor Supermercados] Iniciando agente de compra móvil...")
    print(f"   Comercio: {comercio_seleccionado}")
    print(f"   Usuario: {usuario_movil}")
    
    # Procesar los ingredientes
    items = procesar_texto_lista(texto_receta)
    if not items:
        print("❌ La lista de ingredientes procesada está vacía.")
        return False
        
    print(f"🛒 Items a comprar: {items}")
    
    # Limpiamos el email para que sea un nombre de carpeta válido para el perfil de Chrome
    nombre_perfil = usuario_movil.replace("@", "_").replace(".", "_")
    
    # Ejecutamos las compras usando el bot del supermercado
    exito = ejecutar_compras_supermercado(
        lst=items,
        commerce=comercio_seleccionado,
        user_profile=nombre_perfil,
        lat=18.4655, # Coordenadas de Puerto Rico por defecto
        lon=-66.1057,
        branch=None,
        usuario=usuario_movil,
        password=password_movil
    )
    
    return exito

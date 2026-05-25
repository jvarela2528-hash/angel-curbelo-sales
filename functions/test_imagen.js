const apiKey = "AIzaSyAcfc08tc5sbBxH4Yh9E-4H3nYfbyy3LFg";

async function main() {
    try {
        console.log("Calling Google Imagen API...");
        const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:generateImages?key=${apiKey}`;
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                prompt: "A beautiful tropical sunset with palm trees",
                numberOfImages: 1,
                outputMimeType: "image/png",
                aspectRatio: "1:1"
            })
        });
        
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`HTTP Error ${response.status}: ${errText}`);
        }
        
        const data = await response.json();
        console.log("Success! Generated image keys:", Object.keys(data));
        if (data.generatedImages && data.generatedImages.length > 0) {
            console.log("Image size (base64):", data.generatedImages[0].image.imageBytes.length);
        }
    } catch (error) {
        console.error("Error calling Imagen:", error);
    }
}

main();

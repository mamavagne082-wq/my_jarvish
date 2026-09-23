import math
from PIL import Image, ImageDraw

def create_jarvis_icon(size, filename):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    center = size / 2
    r_outer = size * 0.46
    r_mid = size * 0.35
    r_inner = size * 0.22
    r_core = size * 0.12
    
    # Outer dark glow circle
    draw.ellipse([center - r_outer, center - r_outer, center + r_outer, center + r_outer],
                 fill=(10, 20, 35, 240), outline=(0, 220, 255, 255), width=max(1, int(size * 0.04)))
    
    # Arc reactor segments
    for angle in range(0, 360, 45):
        rad = math.radians(angle)
        x1 = center + (r_mid * 0.6) * math.cos(rad)
        y1 = center + (r_mid * 0.6) * math.sin(rad)
        x2 = center + (r_mid * 1.1) * math.cos(rad)
        y2 = center + (r_mid * 1.1) * math.sin(rad)
        draw.line([x1, y1, x2, y2], fill=(0, 240, 255, 220), width=max(1, int(size * 0.04)))
        
    # Mid ring
    draw.ellipse([center - r_inner, center - r_inner, center + r_inner, center + r_inner],
                 fill=(15, 30, 50, 255), outline=(0, 255, 200, 255), width=max(1, int(size * 0.03)))
    
    # Core glowing center
    draw.ellipse([center - r_core, center - r_core, center + r_core, center + r_core],
                 fill=(0, 255, 240, 255), outline=(255, 255, 255, 255), width=max(1, int(size * 0.02)))
                 
    img.save(filename, "PNG")
    print(f"Saved {filename}")

if __name__ == "__main__":
    create_jarvis_icon(16, r"c:\Users\Al Amin\Downloads\Compressed\Jarvis\Jarvis_Survey_Extension\icons\icon16.png")
    create_jarvis_icon(48, r"c:\Users\Al Amin\Downloads\Compressed\Jarvis\Jarvis_Survey_Extension\icons\icon48.png")
    create_jarvis_icon(128, r"c:\Users\Al Amin\Downloads\Compressed\Jarvis\Jarvis_Survey_Extension\icons\icon128.png")

const photos = ['1_287_122485_l_gal.jpg', 'frontview.webp', 'Edificio-europa-atardecer1.jpg'];
export function referenceImage(index: number, label: string) { return `<img src="/stock-images/${photos[index]}" alt="${label} reference photograph">`; }
export function aboutImage() { return '<img src="/stock-images/1_287_122485_l_gal.jpg" alt="Reference photograph of Edificio Europa in Valencia">'; }

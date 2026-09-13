window.PAGOSYA_CONFIG = {
  demo: true,
  slug: 'star-wars-comics-demo',
  productPage: 'product.html',
  checkoutPage: 'checkout.html',
  data: {
    storeName: 'Thunder & Pulp', checkoutMode: 'payment',
    shippingEnabled: false, contactFormEnabled: false,
    categories: [{id:'individual',name:'Los ejemplares'},{id:'collection',name:'La colección'}],
    items: [
      {id:'sw-jedi',name:'Star Wars (2025) #1',amount:12000,currency:'BOB',stock:12,purchaseLimit:5,categoryId:'individual',description:'Luke, Leia y Han en una nueva era. Star Wars (2025) #1, con portada de Phil Noto. Precio de ejemplo.',imageUrls:['assets/hero.jpg'],variants:[],extras:[]},
      {id:'sw-vader',name:'Darth Vader (2020) #1',amount:11500,currency:'BOB',stock:8,purchaseLimit:5,categoryId:'individual',description:'La sombra del Imperio. Darth Vader (2020) #1, con portada de In-Hyuk Lee. Precio de ejemplo.',imageUrls:['assets/vader.jpg'],variants:[],extras:[]},
      {id:'sw-mando',name:'The Mandalorian (2022) #1',amount:11000,currency:'BOB',stock:10,purchaseLimit:5,categoryId:'individual',description:'Un cazarrecompensas en los confines de la galaxia. The Mandalorian (2022) #1, variante de Leinil Francis Yu. Precio de ejemplo.',imageUrls:['assets/mando.jpg'],variants:[],extras:[]},
      {id:'sw-collection',name:'El archivo galáctico',amount:31500,currency:'BOB',stock:6,purchaseLimit:3,categoryId:'collection',description:'Star Wars, Darth Vader y The Mandalorian: los tres cómics de este demo en una colección de ejemplo.',imageUrls:['assets/hero.jpg','assets/vader.jpg','assets/mando.jpg'],variants:[],extras:[]}
    ]
  }
};

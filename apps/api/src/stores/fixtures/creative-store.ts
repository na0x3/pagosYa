import { nextStoreFiles } from './next-store';

/** Exercises actual library imports, state, artwork and the existing commerce mounts. */
export function creativeStoreFiles() {
  const files = nextStoreFiles();
  files[1].content = `import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { animate } from 'motion';
import { Lottie, useCreativeMotion } from '@pagosya/creative';
import Header from './Header';
const animationData = {v:'5.7.4',fr:30,ip:0,op:60,w:120,h:120,nm:'Orbit',ddd:0,assets:[],layers:[{ddd:0,ind:1,ty:4,nm:'Dot',sr:1,ks:{o:{a:0,k:100},r:{a:0,k:0},p:{a:1,k:[{t:0,s:[30,60,0],e:[90,60,0],o:{x:.33,y:0},i:{x:.67,y:1}},{t:30,s:[90,60,0],e:[30,60,0],o:{x:.33,y:0},i:{x:.67,y:1}},{t:60,s:[30,60,0]}]},a:{a:0,k:[0,0,0]},s:{a:0,k:[100,100,100]}},ao:0,shapes:[{ty:'el',p:{a:0,k:[0,0]},s:{a:0,k:[28,28]},nm:'Circle'},{ty:'fl',c:{a:0,k:[1,.4,0,1]},o:{a:0,k:100},r:1,nm:'Fill'}],ip:0,op:60,st:0,bm:0}]};
export default function Home() {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(true);
  const enabled = useCreativeMotion();
  return <><Header/><motion.main initial={false}><motion.section id="menu" initial={false}>
    <h1>Una carta con carácter</h1>
    <img width="90" height="90" src="/assets/creative/fluent-flat/coffee.svg" alt="Café ilustrado"/>
    <img width="90" height="90" src="/assets/creative/fluent-3d/croissant.png" alt="Croissant ilustrado"/>
    <motion.div data-motion-probe style={{width:24}} initial={false} animate={{transform: enabled && open ? 'translateX(80px)' : 'translateX(0px)'}} transition={{duration: enabled ? .18 : 0}}>✦</motion.div>
    <button onClick={() => setOpen(!open)}>Mover estrella</button>
    <button onClick={event => { if (enabled) animate(event.currentTarget, {opacity:[1,.6,1]}, {duration:.16}); }}>Probar gesto</button>
    <AnimatePresence>{open && <motion.p key="hours" initial={false} exit={{opacity:0}}>Abierto de 8 a 18</motion.p>}</AnimatePresence>
    <button onClick={() => setShown(!shown)}>Mostrar animación</button>
    {shown && <Lottie animationData={animationData} style={{width:180}}/>}
    <div data-pagosya-catalog />
  </motion.section></motion.main><div data-pagosya-cart hidden/><p data-pagosya-status role="status" aria-live="polite"/></>;
}`;
  return files;
}

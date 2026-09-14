// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { createProductForm } from './source-create-product';
import type { MerchantStudioApi } from './api';
afterEach(()=>document.body.replaceChildren());
function setup() {
  const api={createProduct:vi.fn().mockResolvedValue({id:'p1'}),upload:vi.fn()}, saved=vi.fn(), close=vi.fn();
  const guide=createProductForm(api as unknown as MerchantStudioApi,'store-two',saved,close);document.body.append(guide.element);
  const field=(name:string)=>guide.element.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
  const fill=(name:string,value:string)=>{field(name).value=value;field(name).dispatchEvent(new Event('input',{bubbles:true}));};
  const next=()=>guide.element.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  const step=()=>guide.element.querySelector('[data-product-step]')!.textContent;
  return {api,saved,guide,field,fill,next,step};
}
describe('fixed YAPI product questions',()=>{
  it('validates each step, preserves previous answers and saves only after review',async()=>{
    const t=setup();t.next();expect(t.step()).toBe('Paso 1 de 7');
    t.fill('name','Suéter azul');t.next();t.fill('description','Algodón');t.next();
    t.fill('price','-1');t.next();expect(t.step()).toBe('Paso 3 de 7');
    t.fill('price','180.50');t.next();t.next();t.next();t.fill('stock','1.5');t.next();expect(t.step()).toBe('Paso 6 de 7');
    t.fill('stock','3');t.next();expect(t.api.createProduct).not.toHaveBeenCalled();
    t.guide.element.querySelector<HTMLButtonElement>('[data-answer-step="1"]')!.click();expect(t.field('name').value).toBe('Suéter azul');
    for(let i=0;i<6;i++)t.next();expect(t.step()).toBe('Paso 7 de 7');t.next();
    await vi.waitFor(()=>expect(t.saved).toHaveBeenCalledOnce());
    expect(t.api.createProduct).toHaveBeenCalledWith('store-two',{name:'Suéter azul',description:'Algodón',amount:18050,currency:'BOB',stock:3,imageUrls:[]});
  });
  it('retains answers and allows retry when saving fails',async()=>{
    const t=setup();t.api.createProduct.mockRejectedValueOnce(Error('Intenta otra vez'));
    t.fill('name','Cárdigan');t.next();t.next();t.fill('price','120');for(let i=0;i<4;i++)t.next();t.next();
    await vi.waitFor(()=>expect(t.guide.element.querySelector('[data-product-error]')!.textContent).toBe('Intenta otra vez'));
    expect(t.field('name').value).toBe('Cárdigan');t.next();await vi.waitFor(()=>expect(t.saved).toHaveBeenCalledOnce());expect(t.api.createProduct).toHaveBeenCalledTimes(2);
  });
  it('requires generated combinations and saves their independent stock',async()=>{
    const t=setup();t.fill('name','Suéter');t.next();t.next();t.fill('price','100');t.next();t.next();
    t.field('hasOptions').checked=true;t.field('hasOptions').dispatchEvent(new Event('change'));t.next();expect(t.step()).toBe('Paso 5 de 7');
    const fillOption=(selector:string,value:string)=>{const el=t.guide.element.querySelector<HTMLInputElement>(selector)!;el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));};
    fillOption('[data-group-name="0"]','Color');fillOption('[data-group-values="0"]','Azul, Blanco');
    t.guide.element.querySelector<HTMLButtonElement>('[data-generate]')!.click();
    fillOption('[data-row="0"] [data-field="stock"]','3');fillOption('[data-row="1"] [data-field="stock"]','0');
    t.next();t.next();t.next();await vi.waitFor(()=>expect(t.saved).toHaveBeenCalledOnce());
    const data=t.api.createProduct.mock.calls[0][1];expect(data.stock).toBe(3);expect(data.variants.map((v:any)=>v.stock)).toEqual([3,0]);
  });
});

it('edits the selected product while preserving photos and unchanged variant stock',async()=>{
  const api={updateProduct:vi.fn().mockResolvedValue({id:'p-old'}),createProduct:vi.fn(),upload:vi.fn()}, saved=vi.fn();
  const guide=createProductForm(api as unknown as MerchantStudioApi,'store-b',saved,()=>{}, {id:'p-old',name:'Suéter',amount:10000,stock:8,imageUrls:['https://example.test/photo.webp'],variants:[{id:'blue-s',name:'Azul / S',amount:10000,stock:3,options:[{name:'Color',value:'Azul'},{name:'Talla',value:'S'}]},{id:'white-s',name:'Blanco / S',amount:10000,stock:5,options:[{name:'Color',value:'Blanco'},{name:'Talla',value:'S'}]}]});document.body.append(guide.element);
  const name=guide.element.querySelector<HTMLInputElement>('[name=name]')!;name.value='Suéter de algodón';
  for(let i=0;i<7;i++)guide.element.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await vi.waitFor(()=>expect(saved).toHaveBeenCalledOnce());
  expect(api.createProduct).not.toHaveBeenCalled();expect(api.upload).not.toHaveBeenCalled();
  const [storeId,id,input]=api.updateProduct.mock.calls[0];expect([storeId,id]).toEqual(['store-b','p-old']);
  expect(input.imageUrls).toEqual(['https://example.test/photo.webp']);expect(input).not.toHaveProperty('stock');
  expect(input.variants.map((variant:any)=>variant.id)).toEqual(['blue-s','white-s']);
  expect(input.variants.every((variant:any)=>!('stock' in variant))).toBe(true);
  expect(guide.hasChanges).toBe(false);
});

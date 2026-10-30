/** Small, page-local plugin host. Each module owns its DOM, events and cleanup. */
export class PluginHost {
  constructor(root=document) { this.root=root; this.bus=new EventTarget(); this.instances=new Map(); this.destroyed=false; }
  async mount(definition) {
    if(this.destroyed)return null;
    if(this.instances.has(definition.id)) throw new Error(`Plugin already mounted: ${definition.id}`);
    const container=this.root.querySelector(definition.slot);
    if(!container) throw new Error(`Missing plugin slot: ${definition.slot}`);
    const module=await import(definition.module);
    if(this.destroyed)return null;
    const instance=await module.mount(container,{
      bus:this.bus,
      emit:(name,detail={})=>this.bus.dispatchEvent(new CustomEvent(name,{detail})),
      options:definition.options||{},
    });
    if(this.destroyed){instance.destroy?.();return null;}
    this.instances.set(definition.id,instance);
    return instance;
  }
  get(id){return this.instances.get(id);}
  destroy(){this.destroyed=true;for(const instance of [...this.instances.values()].reverse())instance.destroy?.();this.instances.clear();}
}

// Add or remove a plugin here, and give it a slot in index.html.
export const plugins=[
  {id:'piano',slot:'[data-plugin-slot="piano"]',module:'./plugins/piano/plugin.js',options:{idleResumeMs:15000}},
  {id:'logo',slot:'[data-plugin-slot="logo"]',module:'./plugins/logo/plugin.js',options:{playOncePerSession:false}},
];

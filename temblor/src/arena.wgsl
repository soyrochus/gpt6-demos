// SPDX-License-Identifier: GPL-2.0-or-later
struct Camera { vp:mat4x4<f32>, eye_time:vec4<f32> }
struct Stage { mode:vec4<f32>, uv:vec4<f32>, rgb:vec4<f32>, wave:vec4<f32>, anim:vec4<f32> }
struct Material { info:vec4<u32>, stages:array<Stage,8> }
@group(0) @binding(0) var<uniform> cam:Camera;
@group(0) @binding(1) var<storage,read> layers:array<vec2<u32>>;
@group(0) @binding(2) var lights:texture_2d_array<f32>;
@group(0) @binding(3) var repeat_sampler:sampler;
@group(0) @binding(4) var<storage,read> materials:array<Material>;
@group(0) @binding(5) var<storage,read> offsets:array<vec4<f32>>;
@group(0) @binding(6) var bank0:texture_2d_array<f32>;
@group(0) @binding(7) var bank1:texture_2d_array<f32>;
@group(0) @binding(8) var bank2:texture_2d_array<f32>;
@group(0) @binding(9) var bank3:texture_2d_array<f32>;
@group(0) @binding(10) var bank4:texture_2d_array<f32>;
@group(0) @binding(11) var bank5:texture_2d_array<f32>;
@group(0) @binding(12) var bank6:texture_2d_array<f32>;
@group(0) @binding(13) var bank7:texture_2d_array<f32>;
@group(0) @binding(14) var bank8:texture_2d_array<f32>;
@group(0) @binding(15) var bank9:texture_2d_array<f32>;
@group(0) @binding(16) var bank10:texture_2d_array<f32>;
@group(0) @binding(17) var bank11:texture_2d_array<f32>;
@group(0) @binding(18) var bank12:texture_2d_array<f32>;
@group(0) @binding(19) var bank13:texture_2d_array<f32>;
@group(0) @binding(20) var bank14:texture_2d_array<f32>;
fn texel(index:u32,uv:vec2<f32>,dx:vec2<f32>,dy:vec2<f32>)->vec4<f32>{
 let loc=layers[index];
 switch loc.x {
 case 0u: {return textureSampleGrad(bank0,repeat_sampler,uv,i32(loc.y),dx,dy);}
 case 1u: {return textureSampleGrad(bank1,repeat_sampler,uv,i32(loc.y),dx,dy);}
 case 2u: {return textureSampleGrad(bank2,repeat_sampler,uv,i32(loc.y),dx,dy);}
 case 3u: {return textureSampleGrad(bank3,repeat_sampler,uv,i32(loc.y),dx,dy);}
 case 4u: {return textureSampleGrad(bank4,repeat_sampler,uv,i32(loc.y),dx,dy);}
 case 5u: {return textureSampleGrad(bank5,repeat_sampler,uv,i32(loc.y),dx,dy);}
 case 6u: {return textureSampleGrad(bank6,repeat_sampler,uv,i32(loc.y),dx,dy);}
 case 7u: {return textureSampleGrad(bank7,repeat_sampler,uv,i32(loc.y),dx,dy);}
 case 8u: {return textureSampleGrad(bank8,repeat_sampler,uv,i32(loc.y),dx,dy);}
 case 9u: {return textureSampleGrad(bank9,repeat_sampler,uv,i32(loc.y),dx,dy);}
 case 10u: {return textureSampleGrad(bank10,repeat_sampler,uv,i32(loc.y),dx,dy);}
 case 11u: {return textureSampleGrad(bank11,repeat_sampler,uv,i32(loc.y),dx,dy);}
 case 12u: {return textureSampleGrad(bank12,repeat_sampler,uv,i32(loc.y),dx,dy);}
 case 13u: {return textureSampleGrad(bank13,repeat_sampler,uv,i32(loc.y),dx,dy);}
 case 14u: {return textureSampleGrad(bank14,repeat_sampler,uv,i32(loc.y),dx,dy);}
 default: {return vec4(1.);}
 }
}
struct Input { @location(0) p:vec3<f32>, @location(1) uv:vec2<f32>, @location(2) lm:vec2<f32>, @location(3) color:vec4<f32>, @location(4) normal:vec3<f32>, @location(5) ids:vec2<u32> }
struct Out { @builtin(position) clip:vec4<f32>, @location(0) p:vec3<f32>, @location(1) uv:vec2<f32>, @location(2) lm:vec2<f32>, @location(3) color:vec4<f32>, @location(4) normal:vec3<f32>, @location(5) @interpolate(flat) ids:vec2<u32> }
@vertex fn vs(i:Input)->Out { var o:Out;o.p=i.p+offsets[i.ids.y>>16u].xyz;o.clip=cam.vp*vec4(o.p,1);o.uv=i.uv;o.lm=i.lm;o.color=i.color;o.normal=i.normal;o.ids=vec2(i.ids.x,i.ids.y&65535u);return o; }
@fragment fn fs(i:Out,@builtin(front_facing) front:bool)->@location(0) vec4<f32>{
 let du=dpdx(i.uv);let dv=dpdy(i.uv);
 if i.ids.x==0u {return i.color;}
 let mat=materials[i.ids.x];if !front && mat.info.w==0u && mat.info.z==0u {discard;}var color=vec4(0.,0.,0.,1.);
 let ray=normalize(i.p-cam.eye_time.xyz);let refl=reflect(ray,normalize(i.normal));let t=cam.eye_time.w;
 let light=select(i.color.rgb,textureSampleLevel(lights,repeat_sampler,clamp(i.lm,vec2(0.00391),vec2(0.99609)),i32(i.ids.y),0.).rgb*2.,i.ids.y>0u);
 for(var j=0u;j<mat.info.x;j++){
 let s=mat.stages[j];var uv=i.uv;if mat.info.z==1u{uv=vec2(atan2(ray.y,ray.x)/6.283+0.5,acos(clamp(ray.z,-1.,1.))/3.14159);}
 if s.mode.z==1.{uv=vec2(refl.y,-refl.z)*0.5+0.5;} if s.mode.z==2.{uv=i.lm;}
 uv=uv*s.uv.xy+t*s.uv.zw;if s.anim.w==1.{uv=clamp(uv,vec2(0.),vec2(1.));}
 var layer=i32(s.mode.x);if s.anim.y>0.{layer=i32(s.anim.x)+(i32(t*s.anim.z)%i32(s.anim.y));}
 var sample=vec4(light,1.);if layer>=0 {sample=texel(u32(layer),uv,du*s.uv.xy,dv*s.uv.xy);}
 if (s.mode.w>0.&&sample.a<s.mode.w)||(s.mode.w<0.&&sample.a>= -s.mode.w){discard;}
 var rgb=s.rgb.xyz*(s.wave.x+s.wave.y*sin(6.283185*(s.wave.z+t*s.wave.w)));if s.rgb.w==1.{rgb*=i.color.rgb;}if s.rgb.w==2.{rgb*=1.-i.color.rgb;}
 sample=vec4(sample.rgb*rgb,sample.a);switch i32(s.mode.y){case 1:{color=vec4(color.rgb+sample.rgb,1.);}case 2:{color*=sample;}case 3:{color=mix(color,sample,sample.a);}case 4:{color=sample+color*(1.-sample.a);}default:{color=sample;}}
 }
 return vec4(pow(max(color.rgb,vec3(0.)),vec3(0.72)),select(1.,0.60,mat.info.y==1u));
}

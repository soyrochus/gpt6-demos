// Same Saemundsson approximation and -1 degree clamp as Astronomy Engine "normal".
export const localShader = `
uniform mat3 eqToWorld;
uniform float refractOn;
vec3 bend(vec3 p) {
  float h=degrees(asin(clamp(p.y,-1.,1.))), d=max(-1.,h);
  float correction=1.02/(60.*tan(radians(d+10.3/(d+5.11))))*min(1.,(h+90.)/89.);
  float apparent=radians(h+refractOn*correction);
  return vec3(p.x*cos(apparent)/max(.000001,length(p.xz)),sin(apparent),p.z*cos(apparent)/max(.000001,length(p.xz)));
}`;
export const starVertex =
  localShader +
  `
attribute float magnitude;
attribute vec3 tint, motion;
uniform float years, limitMag, exposure, pixelRatio, extinction;
varying vec3 rgb;
varying float energy;
void main(){
  vec3 p=bend(normalize(eqToWorld*(position+years*motion)));
  float h=degrees(asin(clamp(p.y,0.,1.)));
  float airmass=1./max(.025,sin(radians(h))+.50572*pow(h+6.07995,-1.6364));
  float m=magnitude+extinction*(airmass-1.);
  gl_Position=projectionMatrix*viewMatrix*vec4(p*100.,1.);
  if(p.y<0. || m>limitMag) {gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=1.;return;}
  float flux=pow(10.,-.4*m);
  energy=clamp(exposure*pow(flux,.22)*1.95,.08,1.);
  gl_PointSize=pixelRatio*clamp(1.+6.5*pow(flux,.24),1.3,12.);
  rgb=tint;
}`;
export const starFragment = `
varying vec3 rgb;
varying float energy;
void main(){
  float r=length(gl_PointCoord-.5)*2.;
  if(r>1.) discard;
  float core=exp(-r*r*10.);
  gl_FragColor=vec4(mix(rgb,vec3(1.),.28*core),energy*(.8*core+.2*exp(-r*r*3.5)));
}`;
export const skyVertex = `
varying vec2 screenPos;
void main(){screenPos=position.xy; gl_Position=vec4(position.xy,0.9999,1.);}
`;
export const skyFragment = `
varying vec2 screenPos;
uniform vec3 forwardDir,rightDir,upDir,sunDir,moonDir;
uniform mat3 worldToEq;
uniform sampler2D density;
uniform float aspect,tanHalfFov,day,twilight,glow,moonlight,showDust,phase,sunRadius,moonRadius,backgroundExposure;
void main(){
  vec3 ray=normalize(forwardDir+(rightDir*screenPos.x*aspect+upDir*screenPos.y)*tanHalfFov);
  float h=ray.y, low=exp(-max(h,0.)*4.3);
  vec3 eq=worldToEq*ray;
  vec2 uv=vec2(fract(atan(eq.y,eq.x)/6.2831853+1.),eq.z*.5+.5);
  float dust=texture2D(density,uv).r;
  vec3 night=mix(vec3(.018,.030,.061),vec3(.085,.125,.156),low);
  night+=vec3(.10,.093,.13)*smoothstep(.17,.85,dust)*showDust*(1.-glow*.7)*(1.-moonlight*.5);
  night+=low*glow*vec3(.14,.106,.071)+moonlight*vec3(.028,.032,.055);
  float toward=pow(max(dot(ray,sunDir),0.),4.);
  vec3 dusk=mix(vec3(.073,.104,.19),vec3(.43,.28,.22),low*(.55+.45*toward));
  vec3 c=mix(mix(night,dusk,twilight),mix(vec3(.16,.34,.59),vec3(.56,.70,.81),low),day);
  c*=backgroundExposure;
  float sd=length(ray-sunDir)/sunRadius, md=length(ray-moonDir)/moonRadius;
  float sw=max(fwidth(sd),.005),mw=max(fwidth(md),.005);
  c+=vec3(.42,.32,.15)*exp(-sd*.32);
  c=mix(c,vec3(1.,.94,.72),1.-smoothstep(1.-sw,1.+sw,sd));
  if(md<1.+mw){
    vec3 limb=normalize(sunDir-moonDir*dot(moonDir,sunDir));
    float z=clamp(2.*phase-1.,-1.,1.);
    float light=dot(ray-moonDir,limb)/moonRadius*sqrt(max(0.,1.-z*z))+sqrt(max(0.,1.-md*md))*z;
    c=mix(c,mix(c*.6,vec3(.91,.9,.79),smoothstep(-.035,.035,light)),1.-smoothstep(1.-mw,1.+mw,md));
  }
  if(h<0.){
    float az=atan(ray.x,ray.z);
    float ridge=-.012-.023*(.5+.5*sin(7.*az+.8*sin(3.*az)))-.009*sin(19.*az);
    c=mix(vec3(.053,.082,.094),vec3(.029,.049,.059),(1.-smoothstep(ridge-.001,ridge+.001,h)));
    c+=day*vec3(.09,.125,.095);
  }
  gl_FragColor=vec4(c,1.);
}`;

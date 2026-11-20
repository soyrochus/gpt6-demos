// SPDX-License-Identifier: GPL-2.0-or-later
// Only the environment callbacks belong to Temblor. Movement runs upstream Pmove.
#include "q_shared.h"
#include "bg_public.h"
#include <stdio.h>
static int scenario;
void trap_SnapVector(float *v){for(int i=0;i<3;i++)v[i]=rintf(v[i]);}
void QDECL Com_Printf(const char *fmt,...){}
void QDECL Com_Error(int code,const char *fmt,...){abort();}
static int contents(const vec3_t p,int pass){return 0;}
static void box(trace_t *r,const float *p,const float *q,const float *mins,const float *maxs,const float *lo,const float *hi){
 float enter=-1,leave=1,normal[3]={0};int outside=0,endout=0;
 for(int a=0;a<3;a++)for(int sign=-1;sign<=1;sign+=2){float limit=sign>0?hi[a]-mins[a]:maxs[a]-lo[a];float d1=sign*p[a]-limit,d2=sign*q[a]-limit;outside|=d1>0;endout|=d2>0;if(d1>0&&d2>=d1)return;if(d1<=0&&d2<=0)continue;
 if(d1>d2){float f=(d1-.125f)/(d1-d2);if(f>enter){enter=f;memset(normal,0,sizeof(normal));normal[a]=sign;}}else{float f=(d1+.125f)/(d1-d2);if(f<leave)leave=f;}}
 if(!outside){r->startsolid=1;if(!endout){r->allsolid=1;r->fraction=0;}return;}
 if(enter<leave&&enter>-1&&enter<r->fraction){r->fraction=fmaxf(enter,0);VectorCopy(normal,r->plane.normal);r->entityNum=ENTITYNUM_WORLD;r->contents=CONTENTS_SOLID;}
}
static void trace(trace_t *r,const vec3_t p,const vec3_t min,const vec3_t max,const vec3_t q,int pass,int mask){
 memset(r,0,sizeof(*r));r->fraction=1;r->entityNum=ENTITYNUM_NONE;
 box(r,p,q,min,max,(vec3_t){-4096,-4096,-512},(vec3_t){4096,4096,0});
 if(scenario==2)box(r,p,q,min,max,(vec3_t){64,-256,0},(vec3_t){512,256,16});
 if(scenario==3)box(r,p,q,min,max,(vec3_t){96,-2048,0},(vec3_t){128,2048,512});
 for(int i=0;i<3;i++)r->endpos[i]=p[i]+r->fraction*(q[i]-p[i]);
}
int main(void){puts("case,ms,x,y,z,vx,vy,vz");for(scenario=0;scenario<4;scenario++){playerState_t ps={0};pmove_t pm={0};
 ps.origin[2]=24.125;ps.gravity=800;ps.speed=320;ps.stats[STAT_HEALTH]=100;ps.pm_type=PM_NORMAL;ps.groundEntityNum=ENTITYNUM_WORLD;ps.weapon=WP_MACHINEGUN;pm.ps=&ps;pm.trace=trace;pm.pointcontents=contents;pm.tracemask=MASK_PLAYERSOLID;pm.pmove_fixed=1;pm.pmove_msec=8;
 for(int i=1;i<=128;i++){pm.cmd.serverTime=i*8;pm.cmd.forwardmove=scenario==1?0:(scenario==0&&i>48?0:127);pm.cmd.rightmove=scenario==3?127:0;pm.cmd.upmove=scenario==1&&i==1?127:0;pm.cmd.weapon=WP_MACHINEGUN;Pmove(&pm);if(i==1||i%8==0)printf("%d,%d,%.5f,%.5f,%.5f,%.0f,%.0f,%.0f\n",scenario,i*8,ps.origin[0],ps.origin[1],ps.origin[2],ps.velocity[0],ps.velocity[1],ps.velocity[2]);}
 }return 0;}

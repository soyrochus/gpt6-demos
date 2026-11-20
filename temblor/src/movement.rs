// SPDX-License-Identifier: GPL-2.0-or-later
//! Adapted from id Software bg_pmove.c and bg_slidemove.c (see notices/ENGINE.md).
use crate::collision::Space;
use glam::Vec3;
pub const DT: f32 = 0.008;
#[derive(Clone, Copy, Default, Debug)]
pub struct Cmd {
    pub forward: f32,
    pub side: f32,
    pub yaw: f32,
    pub pitch: f32,
    pub jump: bool,
    pub crouch: bool,
    pub fire: bool,
    pub weapon: usize,
}
#[derive(Clone, Copy, Debug)]
pub struct Body {
    pub pos: Vec3,
    pub vel: Vec3,
    pub yaw: f32,
    pub pitch: f32,
    pub crouch: bool,
    pub grounded: bool,
    pub held_jump: bool,
}
impl Body {
    pub fn new(pos: Vec3, yaw: f32) -> Self {
        Self {
            pos,
            vel: Vec3::ZERO,
            yaw,
            pitch: 0.,
            crouch: false,
            grounded: false,
            held_jump: false,
        }
    }
    pub fn eye(&self) -> Vec3 {
        self.pos + Vec3::Z * if self.crouch { 12. } else { 26. }
    }
    pub fn bounds(&self) -> (Vec3, Vec3) {
        (
            self.pos - Vec3::new(15., 15., 24.),
            self.pos + Vec3::new(15., 15., if self.crouch { 16. } else { 32. }),
        )
    }
    pub fn step(&mut self, c: Cmd, space: &Space, water: bool) {
        self.yaw = c.yaw;
        self.pitch = c.pitch.clamp(-1.54, 1.54);
        self.crouch = c.crouch
            || (self.crouch
                && space
                    .trace(
                        self.pos + 4. * Vec3::Z,
                        self.pos + 4. * Vec3::Z,
                        Vec3::new(15., 15., 28.),
                    )
                    .inside);
        let h = Vec3::new(15., 15., if self.crouch { 20. } else { 28. });
        let offset = Vec3::Z * (h.z - 24.);
        let mut p = self.pos + offset;
        // PM_CorrectAllSolid tests neighbouring points when roundoff wedges the hull.
        if space.trace(p, p, h).inside {
            'recover: for radius in [0.25, 1., 2.] {
                for dz in [1., 0., -1.] {
                    for dx in [0., 1., -1.] {
                        for dy in [0., 1., -1.] {
                            let test = p + Vec3::new(dx, dy, dz) * radius;
                            if !space.trace(test, test, h).inside {
                                p = test;
                                break 'recover;
                            }
                        }
                    }
                }
            }
        }
        let ground = space.trace(p, p - Vec3::Z * 0.3, h);
        self.grounded = ground.fraction < 1. && ground.normal.z > 0.7 && self.vel.z < 10.;
        if self.grounded && c.jump && !self.held_jump && !self.crouch {
            self.vel.z = 270.;
            self.grounded = false
        }
        self.held_jump = c.jump;
        let speed = self.vel.truncate().length();
        if self.grounded && speed > 0. {
            let factor = (speed - speed.max(100.) * 6. * DT).max(0.) / speed;
            self.vel.x *= factor;
            self.vel.y *= factor;
            self.vel.z = 0.;
        }
        let front = Vec3::new(c.yaw.cos(), c.yaw.sin(), 0.);
        let wish = if water {
            direction(c.yaw, c.pitch) * c.forward
                + front.cross(Vec3::Z) * c.side
                + Vec3::Z
                    * if c.jump {
                        1.
                    } else if c.crouch {
                        -1.
                    } else {
                        0.
                    }
        } else {
            front * c.forward + front.cross(Vec3::Z) * c.side
        };
        let dir = wish.normalize_or_zero();
        let speed = if water {
            175.
        } else if self.crouch {
            80.
        } else {
            320.
        } * wish.length().min(1.);
        let accel = if water {
            4.
        } else if self.grounded {
            10.
        } else {
            1.
        };
        self.vel += dir * (speed - self.vel.dot(dir)).clamp(0., accel * speed * DT);
        let g = if water { 300. } else { 800. };
        if !self.grounded {
            self.vel.z -= g * DT * 0.5;
            if water && c.jump {
                self.vel.z = self.vel.z.max(140.);
                let ledge = self.pos + front * 30. + Vec3::Z * 4.;
                if c.forward > 0.
                    && space.world.trace(ledge, ledge, Vec3::ZERO, 1).inside
                    && !space
                        .world
                        .trace(ledge + Vec3::Z * 20., ledge + Vec3::Z * 20., Vec3::ZERO, 1)
                        .inside
                {
                    self.vel = front * 200. + Vec3::Z * 350.
                }
            }
        }
        let (mut end, mut v, blocked) = slide(space, p, self.vel, h);
        if blocked && self.grounded {
            let up = p + 18. * Vec3::Z;
            let rise = space.trace(p, up, h);
            if !rise.inside {
                let raised = p.lerp(up, rise.fraction);
                let (step, sv, _) = slide(space, raised, self.vel, h);
                let down = step - Vec3::Z * (18.5 * rise.fraction);
                let floor = space.trace(step, down, h);
                if floor.normal.z > 0.7 && !floor.inside {
                    let landed = step.lerp(down, floor.fraction);
                    if (landed - p).truncate().length_squared()
                        > (end - p).truncate().length_squared()
                    {
                        end = landed;
                        v = sv
                    }
                }
            }
        }
        self.pos = end - offset;
        self.vel = v;
        if !self.grounded {
            self.vel.z -= g * DT * 0.5
        }
        self.vel = self.vel.round();
    }
}
fn slide(space: &Space, mut p: Vec3, mut v: Vec3, h: Vec3) -> (Vec3, Vec3, bool) {
    let mut time = DT;
    let mut blocked = false;
    let mut normals = [Vec3::ZERO; 4];
    for i in 0..4 {
        let end = p + v * time;
        let hit = space.trace(p, end, h);
        if hit.inside {
            return (p, Vec3::ZERO, true);
        }
        p = p.lerp(end, hit.fraction);
        if hit.fraction >= 1. {
            break;
        }
        blocked = true;
        time *= 1. - hit.fraction;
        normals[i] = hit.normal;
        let old = v;
        for &n in &normals[..=i] {
            if v.dot(n) < 0. {
                v -= n * v.dot(n) * 1.001;
                for &m in &normals[..=i] {
                    if v.dot(m) < -0.01 {
                        let edge = n.cross(m).normalize_or_zero();
                        v = edge * old.dot(edge)
                    }
                }
            }
        }
    }
    (p, v, blocked)
}
pub fn direction(yaw: f32, pitch: f32) -> Vec3 {
    Vec3::new(
        yaw.cos() * pitch.cos(),
        yaw.sin() * pitch.cos(),
        pitch.sin(),
    )
}

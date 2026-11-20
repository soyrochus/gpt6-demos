// SPDX-License-Identifier: GPL-2.0-or-later
use temblor::{bsp::Map, game::Game, movement::Cmd};
fn main() {
    let m = Map::parse(include_bytes!("../assets/source/maps/oa_rpg3dm2.bsp")).unwrap();
    let mut g = Game::new(&m, 0x715).unwrap();
    g.areas = Some(
        temblor::aas::Areas::parse(include_bytes!("../assets/source/maps/oa_rpg3dm2.aas")).unwrap(),
    );
    println!(
        "{} nav nodes, spawns {:?} {:?}",
        g.nav.points.len(),
        g.actors[0].body.pos,
        g.actors[1].body.pos
    );
    let aimed = std::env::args().any(|a| a == "--aim");
    for _ in 0..75000 {
        let a = &g.actors[0];
        let b = &g.actors[1];
        let d = b.body.eye() - a.body.eye();
        let cmd = Cmd {
            yaw: if aimed { d.y.atan2(d.x) } else { a.body.yaw },
            pitch: if aimed {
                d.z.atan2(d.truncate().length())
            } else {
                0.
            },
            fire: aimed && b.hp > 0 && g.world.visible(a.body.eye(), b.body.eye()),
            ..Cmd::default()
        };
        g.tick(cmd);
        for e in g.events.drain(..) {
            if matches!(
                e["kind"].as_str(),
                Some("pickup" | "frag" | "intermission" | "suicide")
            ) {
                println!("{}", e)
            }
        }
        if g.time % 30000 == 0 {
            println!(
                "{} {:?} nav {:?}",
                g.snapshot(),
                g.actors[1].body,
                g.route_debug()
            )
        }
        if g.winner.is_some() {
            break;
        }
    }
    println!("{}", g.snapshot())
}

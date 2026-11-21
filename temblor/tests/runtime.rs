// SPDX-License-Identifier: GPL-2.0-or-later
use glam::Vec3;
use temblor::{
    aas::Areas,
    bsp::Map,
    collision::{box_brush, Space, World},
    content::Vfs,
    game::Game,
    material::Palette,
    movement::{Body, Cmd},
};
const BSP: &[u8] = include_bytes!("../assets/source/maps/oa_rpg3dm2.bsp");
const AAS: &[u8] = include_bytes!("../assets/source/maps/oa_rpg3dm2.aas");
#[test]
fn reference_commands() {
    let rows = include_str!("../evidence/reference-movement.csv");
    for case in 0..4 {
        let mut solids = vec![box_brush(
            Vec3::new(-4096., -4096., -512.),
            Vec3::new(4096., 4096., 0.),
            1,
        )];
        if case == 2 {
            solids.push(box_brush(
                Vec3::new(64., -256., 0.),
                Vec3::new(512., 256., 16.),
                1,
            ))
        }
        if case == 3 {
            solids.push(box_brush(
                Vec3::new(96., -2048., 0.),
                Vec3::new(128., 2048., 512.),
                1,
            ))
        }
        let world = World::new(solids);
        let space = Space {
            world: &world,
            movers: &[],
            other: None,
        };
        let mut b = Body::new(Vec3::Z * 24.125, 0.);
        let mut worst = 0f32;
        for step in 1..=128 {
            b.step(
                Cmd {
                    forward: if case == 1 || case == 0 && step > 48 {
                        0.
                    } else {
                        1.
                    },
                    side: if case == 3 { 1. } else { 0. },
                    jump: case == 1 && step == 1,
                    ..Cmd::default()
                },
                &space,
                false,
            );
            if let Some(line) = rows
                .lines()
                .skip(1)
                .find(|r| r.starts_with(&format!("{case},{},", step * 8)))
            {
                let v: Vec<f32> = line.split(',').map(|x| x.parse().unwrap()).collect();
                let expected = Vec3::new(v[2], v[3], v[4]);
                worst = worst.max((b.pos - expected).abs().max_element())
            }
        }
        println!("reference case {case} max coordinate error {worst}");
        assert!(worst <= 0.5, "case {case}: {worst} units");
    }
}
#[test]
fn real_map_and_materials() {
    let mut fs = Vfs::default();
    fs.mount("arena.pk3", include_bytes!("../assets/arena.pk3").to_vec())
        .unwrap();
    let m = Map::parse(&fs.read("maps/oa_rpg3dm2.bsp").unwrap()).unwrap();
    assert_eq!(
        m.entities
            .iter()
            .filter(|e| e["classname"] == "info_player_deathmatch")
            .count(),
        4
    );
    let mut p = Palette::load(&m, &mut fs).unwrap();
    for (name, dimensions) in [
        ("textures/base_wall/concrete_dark.jpg", (512, 512)),
        ("textures/base_wall/bluemetalsupport2e.jpg", (256, 128)),
        ("textures/base_floor/metfloor1.jpg", (128, 128)),
    ] {
        let layer = p.layers.iter().find(|l| l.name == name).unwrap();
        assert_eq!(layer.image.dimensions(), dimensions);
    }
    let mut actors = Vfs::default();
    actors
        .mount(
            "actors.pk3",
            include_bytes!("../assets/actors.pk3").to_vec(),
        )
        .unwrap();
    temblor::models::Actors::load(&mut actors, &mut p).unwrap();
    assert!(p.layers.len() > 25);
    assert!(p.warnings.is_empty(), "{:?}", p.warnings);
    assert!(fs.origin("maps/oa_rpg3dm2.aas").is_some());
}
#[test]
fn rejects_invalid_inputs() {
    for b in [&b""[..], &BSP[..120]] {
        assert!(Map::parse(b).is_err())
    }
    let mut b = BSP.to_vec();
    b[4] = 47;
    assert!(Map::parse(&b).err().unwrap().contains("version"));
    b[4] = 46;
    b[8..12].fill(255);
    assert!(Map::parse(&b).is_err());
    assert!(temblor::content::path("../x").is_err());
    assert!(Vfs::default().mount("bad.pk3", vec![1]).is_err());
}
#[test]
fn seeded_bot_five_frags_and_rematch() {
    let m = Map::parse(BSP).unwrap();
    let mut g = Game::new(&m, 1813).unwrap();
    g.areas = Some(Areas::parse(AAS).unwrap());
    let initial = g.snapshot();
    let mut frags = 0;
    let mut pickups = 0;
    for _ in 0..37500 {
        g.tick(Cmd::default());
        for e in g.events.drain(..) {
            match e["kind"].as_str() {
                Some("frag") => frags += 1,
                Some("pickup") => pickups += 1,
                _ => {}
            }
        }
        if g.winner.is_some() {
            break;
        }
    }
    assert_eq!(g.winner, Some(1));
    assert!(frags >= 5 && pickups > 0);
    let frozen = g.snapshot();
    for _ in 0..20 {
        g.tick(Cmd {
            fire: true,
            ..Cmd::default()
        })
    }
    assert_eq!(frozen, g.snapshot());
    g.reset();
    assert_eq!(initial, g.snapshot());
    assert!(g.items.iter().all(|i| i.next == 0) && g.missiles.is_empty());
}

#[test]
fn low_ceiling_blocks_jump_and_standing_up() {
    let floor = box_brush(Vec3::new(-600., -200., -60.), Vec3::new(600., 200., 0.), 1);
    let ceiling = box_brush(Vec3::new(90., -160., 43.), Vec3::new(240., 160., 100.), 1);
    let world = World::new(vec![floor, ceiling]);
    let space = Space {
        world: &world,
        movers: &[],
        other: None,
    };
    let mut a = Body::new(Vec3::new(0., 0., 24.125), 0.);
    for _ in 0..100 {
        a.step(
            Cmd {
                forward: 1.,
                ..Cmd::default()
            },
            &space,
            false,
        );
    }
    assert!(a.pos.x < 76.);
    for _ in 0..125 {
        a.step(
            Cmd {
                forward: 1.,
                crouch: true,
                ..Cmd::default()
            },
            &space,
            false,
        );
    }
    assert!(a.pos.x > 100. && a.pos.x < 235.);
    for _ in 0..16 {
        a.step(
            Cmd {
                jump: true,
                ..Cmd::default()
            },
            &space,
            false,
        );
    }
    assert!(a.crouch && a.pos.z < 25.);
}

#[test]
fn real_jump_pad_launches_through_touch_volume() {
    let map = Map::parse(BSP).unwrap();
    let mut game = Game::new(&map, 1813).unwrap();
    let trigger = map
        .entities
        .iter()
        .find(|e| e["classname"] == "trigger_push")
        .unwrap();
    let index = trigger["model"][1..].parse::<usize>().unwrap();
    let model = &map.models[index];
    let xy = (model.min + model.max) * 0.5;
    let stand = game
        .world
        .floor(Vec3::new(xy.x, xy.y, model.max.z + 40.), 90.)
        .unwrap();
    game.actors[0].body = Body::new(stand, 0.);
    game.tick(Cmd::default());
    assert!(game
        .events
        .iter()
        .any(|e| e["kind"] == "jump pad" && e["actor"] == 0));
    let mut apex = stand.z;
    for _ in 0..120 {
        game.tick(Cmd::default());
        apex = apex.max(game.actors[0].body.pos.z)
    }
    assert!(apex > stand.z + 50.);
}

#[test]
fn jump_crosses_gap_and_oblique_wall_slides() {
    use temblor::bsp::Plane;
    let platform = |lo, hi| box_brush(Vec3::new(lo, -256., -64.), Vec3::new(hi, 256., 0.), 1);
    let world = World::new(vec![platform(-500., 0.), platform(90., 700.)]);
    let space = Space {
        world: &world,
        movers: &[],
        other: None,
    };
    let mut body = Body::new(Vec3::new(-160., 0., 24.125), 0.);
    let mut jumped = false;
    for _ in 0..180 {
        let jump = !jumped && body.pos.x > -23.;
        jumped |= jump;
        body.step(
            Cmd {
                forward: 1.,
                jump,
                ..Cmd::default()
            },
            &space,
            false,
        );
    }
    assert!(jumped && body.grounded && body.pos.x > 140. && body.pos.z >= 24.);
    let n = Vec3::new(-0.8, -0.6, 0.);
    let mut wedge = box_brush(Vec3::new(-200., -400., 0.), Vec3::new(600., 400., 300.), 1);
    wedge.planes.push(Plane { n, d: -64. });
    let world = World::new(vec![platform(-600., 900.), wedge]);
    let space = Space {
        world: &world,
        movers: &[],
        other: None,
    };
    let mut body = Body::new(Vec3::Z * 24.125, 0.);
    for _ in 0..100 {
        body.step(
            Cmd {
                forward: 1.,
                ..Cmd::default()
            },
            &space,
            false,
        );
    }
    assert!(body.pos.y < -40. && body.pos.dot(n) > -64. + 20.);
}

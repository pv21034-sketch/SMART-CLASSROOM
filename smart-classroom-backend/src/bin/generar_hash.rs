
use argon2::{
    password_hash::{
        rand_core::OsRng,
        PasswordHasher,
        SaltString,
    },
    Argon2,
};

use std::io::{self, Write};

fn main() {
    print!("Escribe tu nueva contraseña: ");
    io::stdout().flush().expect("Error de salida");

    let mut password = String::new();

    io::stdin()
        .read_line(&mut password)
        .expect("Error leyendo contraseña");

    let password = password.trim_end_matches(&['\r', '\n'][..]);

    if password.is_empty() {
        eprintln!("La contraseña no puede estar vacía.");
        return;
    }

    let salt = SaltString::generate(&mut OsRng);

    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .expect("Error generando hash Argon2");

    println!("\nHASH ARGON2:");
    println!("{}", hash);
}

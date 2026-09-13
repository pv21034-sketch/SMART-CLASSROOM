pub mod medicion; 
//Luego agregare pub mod aulas; pub mod sensor; y otras cosas 




use axum::Router; 

pub fn create_router()-> Router{
    Router::new()
    //Usamos merge 
    .merge(mediciones::mediciones_routes())
}
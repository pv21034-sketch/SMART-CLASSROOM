pub mod mediciones;
pub mod aulas; 
//Luego agregare  pub mod sensor; y otras cosas 




use axum::Router; 

pub fn create_router()-> Router{
    Router::new()
    //Usamos merge 
    .merge(mediciones::mediciones_routes())
    .merge(aulas::aulas_routes()) // actilizamos para crear la ruta de aulas 
}
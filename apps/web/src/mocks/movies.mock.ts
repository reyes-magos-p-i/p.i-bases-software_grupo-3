import type { Movie } from '@/types/movie'

import hpImage from '@/assets/images/movies/hp.jpg'
import lotrImage from '@/assets/images/movies/lotr.jpg'
import scarfaceImage from '@/assets/images/movies/scarface.jpg'

export const mockMovies: Movie[] = [
  {
    title: 'Harry Potter: Las Reliquias de la Muerte',
    posterImage: hpImage,
  },
  {
    title: 'El Señor de los Anillos: El Retorno del Rey',
    posterImage: lotrImage,
  },
  {
    title: 'Scarface',
    posterImage: scarfaceImage,
  },
]
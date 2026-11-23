// SCRUM-436: the main read queries of each module, called through the compiled repositories
// (apps/api/dist), so the benchmark measures exactly the SQL and binds the API sends.
// IDs come from DEVELOPMENT after the SCRUM-434 cleanup (see docs/query-optimization.md).
// Excluded on purpose: the portal catalog (movie-functions), rewritten in SCRUM-437.

module.exports = function scenarios(dist) {
  const repos = (db) => {
    const { TransactionsRepository } = require(`${dist}/transactions/transactions.repository.js`)
    const { PurchaseCatalogRepository } = require(`${dist}/purchases/purchase-catalog.repository.js`)
    const { TicketEmailRepository } = require(`${dist}/purchases/ticket-email.repository.js`)
    const { PurchasesRepository } = require(`${dist}/purchases/purchases.repository.js`)
    const { ProjectionsRepository } = require(`${dist}/projections/projections.repository.js`)
    const { CinemasRepository } = require(`${dist}/cinemas/cinemas.repository/cinemas.repository.js`)
    const { ChairsRepository } = require(`${dist}/theaters/chairs.repository.js`)
    const { TheaterRepository } = require(`${dist}/theaters/theater.repository/theater.repository.js`)
    const { UsersRepository } = require(`${dist}/users/users.repository.js`)
    const { ClientsRepository } = require(`${dist}/clients/clients.repository.js`)
    const { MoviesRepository } = require(`${dist}/movies/movies.repository.js`)
    const { TicketsRepository } = require(`${dist}/tickets/tickets.repository/tickets.repository.js`)
    const catalog = new PurchaseCatalogRepository(db)
    const chairs = new ChairsRepository(db)
    return {
      transactions: new TransactionsRepository(db),
      catalog,
      purchases: new PurchasesRepository(db, catalog, new TicketEmailRepository(db)),
      projections: new ProjectionsRepository(db),
      cinemas: new CinemasRepository(db),
      chairs,
      theaters: new TheaterRepository(db, chairs),
      users: new UsersRepository(db),
      clients: new ClientsRepository(db),
      movies: new MoviesRepository(db),
      tickets: new TicketsRepository(db),
    }
  }
  const dto = (file, name, values = {}) => Object.assign(new (require(`${dist}/${file}`)[name])(), values)

  // [module, scenario, call]
  const list = [
    ['Transacciones', 'Listado de transacciones', (r) => r.transactions.listTransactions(dto('transactions/dto/list-transactions-query.dto.js', 'ListTransactionsQueryDto'))],
    ['Transacciones', 'Detalle de transacción', (r) => r.transactions.findTransactionById(186)],
    ['Transacciones', 'Opciones de filtros', (r) => r.transactions.listFilterOptions()],
    ['Historial de compras', 'Historial del cliente', (r) => r.purchases.list(141, dto('purchases/purchase.dto.js', 'ListPurchasesQueryDto'))],
    ['Historial de compras', 'Detalle de compra', (r) => r.purchases.findOne(146, 141)],
    ['Compra de entradas', 'Película', (r) => r.catalog.getMovie(1)],
    ['Compra de entradas', 'Funciones de la película', (r) => r.catalog.getFunctions(1)],
    ['Compra de entradas', 'Función', (r) => r.catalog.getFunction(183)],
    ['Compra de entradas', 'Límites de compra', (r) => r.catalog.getLimits()],
    ['Compra de entradas', 'Mapa de asientos', async (r) => r.catalog.getSeats(await r.catalog.getFunction(183))],
    ['Cartelera', 'Boleto', (r) => r.tickets.getTicketById(521)],
    ['Cartelera', 'Horarios alternativos del boleto', (r) => r.tickets.getAlternativeShowtimesByTicketId(521)],
    ['Proyecciones', 'Listado de proyecciones', (r) => r.projections.listProjections(dto('projections/dto/list-projections-query.dto.js', 'ListProjectionsQueryDto'))],
    ['Proyecciones', 'Detalle de proyección', (r) => r.projections.findProjection(183)],
    ['Proyecciones', 'Sucursales y salas', (r) => r.projections.getCatalogs(true)],
    ['Proyecciones', 'Películas programadas', (r) => r.projections.getScheduledMovies()],
    ['Proyecciones', 'Películas disponibles', (r) => r.projections.findAvailableMovies(41, '')],
    ['Sucursales', 'Listado de sucursales', (r) => r.cinemas.listCinemas(dto('cinemas/dto/list-cinemas-query.dto.js', 'ListCinemasQueryDto'))],
    ['Sucursales', 'Detalle de sucursal', (r) => r.cinemas.findCinemaById(1)],
    ['Sucursales', 'Todas las sucursales', (r) => r.cinemas.getAllCinemas()],
    ['Salas', 'Listado de salas', (r) => r.theaters.getAllTheaters()],
    ['Salas', 'Detalle de sala', (r) => r.theaters.getTheaterById(222)],
    ['Salas', 'Asientos de la sala', (r) => r.chairs.findByTheater(222)],
    ['Usuarios', 'Listado de empleados', (r) => r.users.listEmployees(dto('users/dto/list-users-query.dto.js', 'ListEmployeesQueryDto'))],
    ['Usuarios', 'Detalle de empleado', (r) => r.users.findEmployeeDetailById(21)],
    ['Usuarios', 'Opciones del listado', (r) => r.users.getEmployeeListOptions()],
    ['Usuarios', 'Listado de clientes', (r) => r.clients.listClients(dto('users/dto/list-users-query.dto.js', 'ListClientsQueryDto'))],
    ['Usuarios', 'Detalle de cliente', (r) => r.clients.findClientDetailById(141)],
    ['Películas', 'Listado de películas', (r) => r.movies.findAll()],
    ['Películas', 'Detalle de película', (r) => r.movies.findOne(1)],
  ]
  return { repos, list }
}

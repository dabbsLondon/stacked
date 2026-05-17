/// <reference path="../pb_data/types.d.ts" />

// Let admins publish / unpublish other users' projects from the Admin view.
// Owners can still edit their own projects; admins additionally get the
// keys to toggle visibility (and edit any field — PocketBase 0.22 has no
// field-level rules, so this is the trade-off).

migrate(
  (db) => {
    const dao = new Dao(db);
    const projects = dao.findCollectionByNameOrId('projects');
    projects.updateRule =
      "owner.id = @request.auth.id || @request.auth.role = 'admin'";
    dao.saveCollection(projects);
  },
  (db) => {
    const dao = new Dao(db);
    const projects = dao.findCollectionByNameOrId('projects');
    projects.updateRule = 'owner.id = @request.auth.id';
    dao.saveCollection(projects);
  },
);

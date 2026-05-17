/// <reference path="../pb_data/types.d.ts" />

// Stacked — add an `is_public` flag to projects so users can publish their
// work to a shared library. Updates the list/view rules so any signed-in
// user can read public projects (in addition to their own, and on top of
// the admin-read-everything rule).

migrate(
  (db) => {
    const dao = new Dao(db);
    const projects = dao.findCollectionByNameOrId('projects');

    if (!projects.schema.getFieldByName('is_public')) {
      projects.schema.addField(
        new SchemaField({
          name: 'is_public',
          type: 'bool',
          required: false,
        }),
      );
    }

    projects.listRule =
      "@request.auth.id != '' && (owner.id = @request.auth.id || @request.auth.role = 'admin' || is_public = true)";
    projects.viewRule =
      "@request.auth.id != '' && (owner.id = @request.auth.id || @request.auth.role = 'admin' || is_public = true)";
    // Create / update / delete stay owner-only (admins also blocked from
    // writing other users' projects; they get read access only).
    projects.createRule =
      "@request.auth.id != '' && @request.data.owner = @request.auth.id";
    projects.updateRule = 'owner.id = @request.auth.id';
    projects.deleteRule = 'owner.id = @request.auth.id';

    dao.saveCollection(projects);
  },
  (db) => {
    const dao = new Dao(db);
    const projects = dao.findCollectionByNameOrId('projects');
    const f = projects.schema.getFieldByName('is_public');
    if (f) {
      projects.schema.removeField(f.id);
    }
    projects.listRule =
      "owner.id = @request.auth.id || @request.auth.role = 'admin'";
    projects.viewRule =
      "owner.id = @request.auth.id || @request.auth.role = 'admin'";
    dao.saveCollection(projects);
  },
);

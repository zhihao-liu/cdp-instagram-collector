let pr = Promise.reject();

const ky = pr.catch(() => console.log(`resolved`));
ky.then(()=> console.log(`yes`), ()=> console.log(`no`));
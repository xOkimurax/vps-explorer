const WebSocket = require('/root/.openclaw/workspace/node_modules/ws');

async function main() {
  const pages = await fetch('http://127.0.0.1:9222/json/list');
  const pageList = await pages.json();
  const pageWsUrl = pageList[0].webSocketDebuggerUrl;

  const ws = new WebSocket(pageWsUrl);

  return new Promise((resolve, reject) => {
    const pending = {};
    let id = 0;

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const thisId = ++id;
        pending[thisId] = { resolve, reject };
        ws.send(JSON.stringify({ id: thisId, method, params }));
        setTimeout(() => {
          if (pending[thisId]) {
            delete pending[thisId];
            reject(new Error(`Timeout for ${method}`));
          }
        }, 15000);
      });
    }

    ws.on('open', async () => {
      console.log('Connected!');
      try {
        await send('DOM.enable');
        await send('Runtime.enable');
        await send('Page.enable');
        // Go back to project page to find backend service
        await send('Page.navigate', { url: 'http://127.0.0.1:3000/dashboard/project/y6i4xQOuNbARznQZFGaW2/environment/30D7tC-7SXa1vQQmzTps6' });
      } catch (e) {
        console.error('Setup error:', e.message);
      }
    });

    ws.on('message', async (msg) => {
      const data = JSON.parse(msg.toString());

      if (data.method === 'Page.loadEventFired') {
        console.log('Project page loaded');

        setTimeout(async () => {
          try {
            // Find and click on backend service
            const backendClick = await send('Runtime.evaluate', { expression: `
              (() => {
                const links = Array.from(document.querySelectorAll('a'));
                const backend = links.find(a => a.innerText.includes('vps-explorer-backend'));
                if (backend) {
                  backend.click();
                  return backend.href;
                }
                return 'NOT FOUND';
              })()
            `});
            console.log('Backend link clicked:', backendClick.result.value);

            // Wait for navigation
            setTimeout(async () => {
              const newUrl = await send('Runtime.evaluate', { expression: 'window.location.href' });
              console.log('Backend URL:', newUrl.result.value);

              // Get backend input values
              const backendInputs = await send('Runtime.evaluate', { expression: `
                (() => {
                  const inputs = document.querySelectorAll('input');
                  const results = [];
                  inputs.forEach(input => {
                    if (input.value) {
                      results.push({
                        name: input.name,
                        value: input.value.substring(0, 80)
                      });
                    }
                  });
                  return JSON.stringify(results);
                })()
              `});
              console.log('Backend inputs:', backendInputs.result.value);

              // Get buttons (Deploy, Reload, Rebuild, etc)
              const buttons = await send('Runtime.evaluate', { expression: `
                (() => {
                  const btns = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(t => t);
                  return JSON.stringify(btns);
                })()
              `});
              console.log('Buttons:', buttons.result.value);

              // Check if Autodeploy is enabled
              const autoDeploy = await send('Runtime.evaluate', { expression: `
                (() => {
                  const content = document.body.innerText;
                  const autoDeployIndex = content.indexOf('Autodeploy');
                  if (autoDeployIndex > -1) {
                    const section = content.substring(autoDeployIndex, autoDeployIndex + 200);
                    return section;
                  }
                  return 'Autodeploy section not found';
                })()
              `});
              console.log('Autodeploy info:', autoDeploy.result.value);

              resolve();
              ws.close();
            }, 2000);

          } catch (e) {
            console.error('Error:', e.message);
            resolve();
            ws.close();
          }
        }, 2000);
      }

      if (data.id && pending[data.id]) {
        const { resolve: res, reject: rej } = pending[data.id];
        delete pending[data.id];
        if (data.result && data.result.exceptionDetails) {
          console.error('Exception:', JSON.stringify(data.result.exceptionDetails).substring(0, 300));
          rej(data.result);
        } else {
          res(data.result);
        }
      }
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err.message);
    });

    setTimeout(() => {
      console.log('Timeout');
      ws.close();
      resolve();
    }, 45000);
  });
}

main()
  .then(() => console.log('Done'))
  .catch(e => console.error('Error:', e));
# boop.fish
website for boop

### TODO
Manage members page

### Done
- Main page
- Frogs
- stats page
- calendar page
- class dice roller
- nodewar 
- black shrine signups


### Setup
- Used pm2
```
  npm install -g pm2
  pm2 start "bun run src/index.ts" --name boop-fish
  pm2 save
  pm2 startup   
```
- to restart
    - `pm2 restart boop-fish`
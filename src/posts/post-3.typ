#import "/blog.typ": template
#show: template.with(
  title: "Typst test post",
  desc: "This is a test post",
  date: "1980-01-01"
)

Typst test document. Styling is incomplete for now.

```javascript
// comment
console.log("hi")
function x(hi) {
  const j = (a) => 5
}
// very very very very very very very long line
```

$ cal(A) := { x in RR | x "is natural" } $

#table(
  columns: (1fr, 1fr, 1fr),
  $5$, $5$, [wasd]
)

---
title: 'Making a C to befunge compiler (part one?)'
pubDate: 2025-02-24
description: 'Ramblings about c, befunge, rust, and perhaps other words.'
tags: ["c-to-befunge"]
---

# Intro

Befunge93 is a 2D, stack based, self overwriting programming language with single character instructions (like brainfuck).
It has a handful of relevant operations:
| Operator | Function |
| -------- | ------- |
| `0`-`9` | Push corresponding number onto the stack |
| `+` `-` `*` `/` `%` | Basic arithmetic on the top two stack values |
| `>` `<` `^` `v` | Change direction of PC |
| `_` | Pop value and compare with zero, if equal go right else go left |
| `\|` | Pop value and compare with zero, if equal go down else go up |
| `g` | Get a value from "fungespace" |
| `p` | Put a value into "fungespace" |

And some other miscellaneous operations:
| Operator | Function |
| -------- | ------- |
| `@` | End program |
| `!` | Logical not |
| ``` ` ``` | Compare top two values push 1 if b>a else push 0 | 
| `:` | Duplicate top stack value |
| `$` | Delete top stack value |
| `#` | Skip the PC over one character |
| `.` | Print the top stack value |

Programs exist in a 2D area called fungespace (infinite space with 0,0 at the top left), and the instruction pointer flows through the program while performing logical operations on the values on it's stack.
```
> 2 3 + v
        5
  @ . * <
```
This program will:

1. Turn to face right
0. Push `2` onto the stack
0. Push `3` onto the stack
0. Pop the top two stack values and add them, pushing the result (`5`) onto the stack
0. Turn to face down
0. Push `5` onto the stack
0. Turn to face left
0. Pop the top two stack values and multiply them, pushing the result (`25`) onto the stack
0. Pop and print the top stack value (`"25"`)
0. End

<video src="/befunge_example1.mp4" controls></video>

The thing that makes the language interesting is the `g`et and `p`ut operations that let you modify fungespace *at runtime*. This can be used for self modifying programs[^11], but is more practically useful for storage of data.

This for example stores data at position 0,0 and then retrieves it again later!
`72* 00p  00g.@`

<video src="/befunge_example2.mp4" controls></video>

Anyways, this interested me so I made [RBeJ](https://github.com/PartyWumpus/RBeJ) (a JIT compiler for befunge), which could perhaps become it's own blog post but shortly after I finished[^1] working on it I discovered [some notes](https://www.phlamethrower.co.uk/befunge/c2b.php) about a theoretical C -> befunge93 compiler. Their compiler never actually got to do any *compiling*, and was never finished, despite being developed on and off for quite a few years. 

Foolishly, I saw this and went... 

> "I bet I could do that."

So I bought Nora Sandler's [Writing a C Compiler](https://norasandler.com/book/) book[^2] and got to work.

Okay well not straight away. Before I can do any compiling of C, I decided it would be sensible to make a simple intermediary language which could compile to befunge, and then write a C compiler to that language. Simple[^3] two stage process, C -> IR -> Befunge93.

But, before I could start working on the IR, I had to build a sort of VM inside of befunge that could run a more traditional stack based language, with function calls and jumps. This requires a call stack, a stack and some way of getting around functions.

# The memory layout

Now I said earlier that befunge was stack-based, so why am I needing to make a stack at all, when I could just use the befunge stack? This is because befunge has very limited stack operations, only allowing you to ever do anything with just the top two bstack (befunge stack) values.

For a language we can compile C to, we're going to need more than just the top two stack values, in fact eventually we're going to need to allow pointers to *anywhere* on the stack, so instead we're going to use the fact that befunge can overwrite it's own code, and store the stack (and the call stack) as an infinite line in fungespace, something like this:

```
v // main stack goes here ######################
v // call stack goes here ######################
v
> // the program goes here
```

This is great, but we're also gonna need a stack pointer & call stack pointer, so we know where we are in the stack. Now we could put those anywhere, but if they go in the top left 10x10 area, they can be accessed easily with only 3 characters (which means shorter programs), ie `00g` and `00p` will get and put values in position `x: 0, y: 0` respectively. This rather makes the space in the top 10x10 quite valuable, so it'll be allocated as a zero page, effectively *100* quick access registers. This should allow for some nice optimizations later too.

Great, so now our program looks like this, and we have plenty of available memory:
(`S` is for 'stack pointer', `C` is for 'call stack pointer' and `Z` is for free zero page)

```
SCZZZZZZZZ 
ZZZZZZZZZZ // main stack goes here ######################
ZZZZZZZZZZ // call stack goes here ######################
ZZZZZZZZZZ
ZZZZZZZZZZ
ZZZZZZZZZZ
ZZZZZZZZZZ
ZZZZZZZZZZ
ZZZZZZZZZZ
ZZZZZZZZZZ
v
> // the program goes here
```

We can get values off the top of the stack with `00g1g`[^4] and similarly `10g2g` for the call stack.

# Linear compilation

We now have enough to implement simple single function programs.

(psuedocode)
```
get stack (00g1g)
decrement stack pointer (00g1-00p)
get stack (00g1g)
add (+)
print (.)
```

```
... the whole zero page you just saw (scroll up)
ZZZZZZZZZZ
ZZZZZZZZZZ
v
> 00g1g 00g1-00p 00g1g + .
```

<video src="/befunge_example3.mp4" controls></video>

So, time to whip up a quick initial design for the IR!
Now a simple IR could just have simple operations that act on values placed on the bstack, like the example above, but that's not really how C works, so will just be leaving *even more* work for the C compiler half to do. Instead, the IR is going to have some slightly higher level operations, like "ADD, stack offset -2, stack offset -1, stack offset 0" (which would add the two values at stack positions SP-2, SP-1 and put the output in position SP+0)

(For getting values offset from the stack pointer we can do `00pN-1g`, where N is the offset)

Let's go for something like this (this is (almost) [Backus-Naur form](https://en.wikipedia.org/wiki/Backus%E2%80%93Naur_form)[^5])
```bash
<statement> ::= <unary_op> | <binary_op> | <io_op>
<io_op> ::= "PRINT" <value>
# Where the first value is the input, and the second is the output
<unary_op> ::= ("MINUS" | "NEGATE" | "COPY") <value> <value>
# Where the first and second values are the input, and the last is the output
<binary_op> ::= ("ADD" | "SUB" | "MULT" | "DIV" | "MODULO") <value> <value> <value> 

<value> ::= <stack_val> | <immediate_val> | <register_val> 
<stack_val> ::= "S" <number>
<immediate_val> ::= "I "<number>
# Two numbers, one for X and one for Y
<register_val> ::= "R" <digit> <digit>
```
(note that "copy" operation is so we can load immediate values into actual locations)
(also note that "io op" is just temporary, it will be removed later)

Okay, so a quick program like
```
COPY I5 S0
COPY I9 S1
ADD S0 S1 S2
PRINT S2
```
(which is basically just `print(5 + 9)`)

Would become: 

(with a `#` between each operation, and remember `00gN-g` for getting values at offsets from the SP)
```
5 00g1p # 9 00g1-1p # 00g1g 00g1-1g + 00g2-1p # 00g2-1g .
```

Now this is terribly inefficient, but the IR we've produced is very simple to optimize, so if instead of trying to optimize our befunge compilation, why not just optimize the IR!

The IR can be rewritten as[^6]:
```
ADD I5 I9 R03
PRINT R03
```
which is then just
```
5 9 + 03p # 03g .
```
This uses three techniques in series:
- Copy propagation (where you can replace `x = y; func(x)` with `x = y; func(y)`
- Dead store elimination (where we can remove unused stores: `x = y; func(y)` -> `func(y)`)
- Register allocation (where you replace stack values with register values)


With simple logic done, we can move on to non-linear logic.

# Jumps
To have a language that C could compile to, we'll need to be able to inline jumps[^9] so if statements and loops can work. 

These are very simple, although implementing them is a little more tedious.

Combine a nice inline `if` like `>#v_>` (which either continues or goes down depending on the value at the top of the bstack when entered from the left) combined with carefully placed arrows and there you go, jumping to labels!

(psuedocode)
```
... logic
jump to LABEL if not zero
... if zero
LABEL:
... rest of code
```

```
logic #v_ if zero > rest of code
       >          ^
```

(psuedocode)
```
... aaa
jump to ZERO if zero
... bbb
jump END
ZERO:
... ccc
END:
... ddd
```

```
aaa !#v_> bbb v> ccc > ddd
      >        ^
              >      ^
```

The actual implementation is not so interesting, but we now have:
```diff
+ <statement> ::= <unary_op> | <binary_op> | <io_op> | <conditional_branch> | <unconditional_branch>
+ <label> ::= ":" <string> ":"
+ <unconditional_branch> ::= "BR" <string>
+ <conditional_branch> ::= <branch_type> <string> <value>
# not equal zero and equal zero
+ <branch_type> ::= "NEQZ" | "EQZ"

<io_op> ::= "PRINT" <value>
<unary_op> ::= ("MINUS" | "NEGATE" | "COPY") <value> <value>
<binary_op> ::= ("ADD" | "SUB" | "MULT" | "DIV" | "MODULO") <value> <value> <value> 

<value> ::= <stack_val> | <immediate_val> | <register_val> 
<stack_val> ::= "S" <number>
<immediate_val> ::= "I "<number>
<register_val> ::= "R" <digit> <digit>
```

# Functions

Now we need to decide what the rest of the program actually looks like. The input language is going to be mostly linear, so we'll probably end up with long lines of befunge, (ignoring jumps, which are all *below* the main body of the function, so we'll just do all this above it!). 
```
...
ZZZZZZZZZZ
ZZZZZZZZZZ
v
v
FUNCTION > FUNCTION ONE ... 
FINDER
LOGIC    > FUNCTION TWO ...
```

That means an individual function has to look something like:

```
function 3 {
  COPY I5 S0
  CALL function 5
  COPY S0 R03
  RETURN S0
}
```

```
ENTRYPOINT # 5 00g1p # CALL 5 # 00g1g 03p # RETURN S0 #
```

Both call and return have to *somehow* get from the right side all the way to the left, so they can get to the function they're calling/were called from respectively. So they'll need something like:

```
// calle return >  >  >         v
// function finder logic      <                           <
ENTRYPOINT # 5 00g1p # CALL 5 ^ > # 00g1g 03p # RETURN S0 ^ #
```

To do this, functions are going to need to not just remember which function they were called by, but also the location inside of the function to return to.

## Implementing CALL
(where `N` is calle ID `I` is the caller function ID, and `J` is location in function, both calculated at compile time)
1. Put function ID on call stack [`I 10g2p`]
1. Put location in function of this call on call stack [`J 10g1+2p`]
1. Increment call stack pointer (by two) [`10g2+10p`]
1. Load position to go to onto the befunge stack, location[^7], then function ID [`0 N`]
1. Exit to the left [`^`]
1. (Have reentry point) [`>`]

Putting it together, `Call N` looks like:
```
// calle return                            v
// function finder logic               <
I 10g2p # J 10g1+2p # 10g2+10p # 0 N # ^ # >
```

## Implementing RETURN
Functions are going to need a place to store their return values. We could use the stack, but with 98 still unused registers, we might as well use one of them for storing return values.

The steps:

(where `VAL` is the value to be returned)
1. Put the returned value in the return register [`VAL 20p`]
1. Load position to go to onto the befunge stack from the call stack [`10g2g`]
1. Load function to go to onto the befunge stack from the call stack [`10g1-2g`]
1. Decrement call stack pointer (by two) [`10g2-10p`]
1. Exit to the left [`^`]

Putting it together, `Return VAL` looks like:
```
// function finder logic               <
VAL 20p # 10g2g # 10g1-2g # 10g2-10p # ^
```

## CALL & RETURN together

Together it looks like 

```
function 3 {
  COPY I5 S0
  CALL function 5
  COPY S0 R03
  RETURN S0
}
```

```
// calle return >  >  >                              v
// function finder logic                           <                                           <
ENTRYPOINT # 5 00g1p # 310g2p 110g1+2p 10g2+10p 0 5^ > # 00g1g 03p # S0 20p10g2g10g1-2g10g2-10p^ #
```

Already getting a bit verbose, and we're just getting started... The static bits of befunge for call and return can be manually optimized a lot better, and I leave that as an exercise to the reader[^8]!

We're now up to
```diff
+ <statement> ::= <op> | <branch> | <call> | <return>
+ <call> ::= "CALL" <function_id>
+ <return> ::= "RETURN" <value>

<label> ::= ":" <string> ":"
+ <branch> ::= <uncond_br> | <cond_br>
<uncond_br> ::= "BR" <string>
<cond_br> ::= ("NEQZ" | "EQZ") <string> <value>

+ <op> ::= <io_op> | <unary_op> | <binary_op>
<io_op> ::= "PRINT" <value>
<unary_op> ::= ("MINUS" | "NEGATE" | "COPY") <value> <value>
<binary_op> ::= ("ADD" | "SUB" | "MULT" | "DIV" | "MODULO") <value> <value> <value> 

<value> ::= <stack_val> | <immediate_val> | <register_val> 
<stack_val> ::= "S" <number>
<immediate_val> ::= "I "<number>
<register_val> ::= "R" <digit> <digit>
```


## The function finder

Now we can generate befunge for calling and for returning, we have to actually implement the function finder logic I've been leaving out this entire time. We know that each function will enter the function finder with 2 values on the bstack: a function ID and a location. Let's break those two down.

### Finding functions
A major limitation here is that the only kind of branching befunge has is checking if a value is zero or not, so we'll want something that uses that compactly.

If function IDs are linear, then this can be done easily enough, by simply counting down:

Stack state to start with: `[location, func id]`
1. First we subtract one from the ID, to count down.
2. Then we duplicate the number on the top of the stack, as branches pop the value off the stack and we still need it if the ID doesn't match.
3. We check if the id is currently zero, if it is we've found our function and we head right into the location resolver (and use `$` to pop off the spare id we duplicated). Otherwise, we head left, down into the next one function ID checker, so back to step one

```
v
>1-:v
v   _$ >> to the location resolver for func 1


>1-:v
v   _$ >> to the location resolver for func 2
...
```

But functions need to be able to exit and head to the start of this chain of function ID checkers, so they can sneak just in-between them, like this:

```
>v
 >1-:v
^       << calls/returns exiting the function
 v   _$ >> to the location resolver for func 1
 
 
 >1-:v
^       << calls/returns exiting the function
 v   _$ >> to the location resolver for func 2
 ...
```

### Resolving the location
We can use a similar "count down till zero" strategy for finding the location, as long as we number those sequentially as well:

```
 >1-:v
        ...
        ^-1<
        >:#^_$  >> entry point 2                            v
        ^-1<
        >:#^_$  >> entry point 1                       v
        ^-1<
^               << calls/returns exiting the function                    
 v   _$ >:#^_$ >> entry point 0 // function goes here
 ```

If we have one of these, we can have functions returning, and calling each other, great stuff!


#### Stack frames
I skipped over it in the call/return impls, but for it to be actually useful, call has to increment the stack pointer for the number of arguments you're going to pass + the stack frame size of the calle, and return has to decrement it by the number of args + stack frame size, but it was a bit much to explain so please pause for a moment and imagine a world where I explained it perfectly, and then move on.


# Conclusion


We now have a fully operational IR with functions, labels and basic arithmetic operations which can compile to befunge. Tune in next time where we learn that C compiling isn't that bad actually[^10], and also the IR is completely inadequate. And yes you did just get to the end of a blog post about a C compiler without a single bit of C in it. Woops.

---

Thanks for reading? Not entirely sure what this was, a half ramble, half "guide". If you thought it was fun please send me hatemail directly to my github account, I think it'd be fun.

---

[^1]: Read: Got bored of working on
[^2]: Certainly didn't just pirate it and then buy it later...
[^3]: Everything is simple when you abstract the entire project away.
[^4]: Where `00g` is 'get stack ptr' and `1g` is 'get value at `x: [previous value on bstack], y: 1`'
[^5]: If you don't know what BNF is, as your favourite computer science graduate, I'm sure they'd love to tell you.
[^6]: With proper constant folding you could even get this to just `PRINT I14` but that's no fun
[^7]: Which in this case is always 0, as function calls always enter by the entry point. Tehcnically an optimization could be done here where no number is added at all, so the befunge stack is left empty as reading the empty bstack is as if there was a zero there, but it would require certainty that no values have snuck onto the befunge stack.
[^8]: At the time of writing, here's the current [return impl](https://github.com/PartyWumpus/C-to-befunge93/blob/7385daf354be32ba9d6698d74f3f3816425c1d57/src/builder.rs#L205) and the current [call impl](https://github.com/PartyWumpus/C-to-befunge93/blob/7385daf354be32ba9d6698d74f3f3816425c1d57/src/builder.rs#L224) but note those also include arguments in calling, and I haven't explained those yet so pretend you don't see em.
[^9]: Yes I'm sure your even freakier esolang can actually trivially run all C code without loops or if statements using recursion but I have a life to live.
[^10]: I lied again
[^11]: And is the reason why befunge is generally impossible to completely compile ahead of time, because the entire program could be overwritten by data that comes from user input.
